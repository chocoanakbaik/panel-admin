-- Choco Panel Admin initial schema.
-- Apply once in the Supabase SQL Editor before configuring production integration.
-- Keep the service-role key server-side only. Never expose it to the browser.

create extension if not exists pgcrypto;

create table if not exists public.integration_sources (
  source_id text primary key,
  display_name text not null,
  enabled boolean not null default true,
  allowed_event_types text[] not null default '{}',
  health_status text not null default 'pending'
    check (health_status in ('pending', 'healthy', 'degraded', 'disconnected')),
  last_event_at timestamptz,
  last_health_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_events (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.integration_sources(source_id),
  event_id text not null,
  schema_version text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  subject_type text,
  subject_ref text,
  severity text check (severity is null or severity in ('info', 'low', 'medium', 'high', 'critical')),
  data_json jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  retention_until timestamptz,
  unique (source_id, event_id),
  unique (source_id, idempotency_key)
);

create index if not exists service_events_received_at_idx on public.service_events (received_at desc);
create index if not exists service_events_source_received_idx on public.service_events (source_id, received_at desc);
create index if not exists service_events_type_received_idx on public.service_events (event_type, received_at desc);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.integration_sources(source_id),
  source_account_ref text not null,
  display_label text,
  status_cache text not null default 'unknown'
    check (status_cache in ('unknown', 'active', 'suspended', 'deactivated')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  last_status_sync_at timestamptz,
  unique (source_id, source_account_ref)
);

create index if not exists accounts_last_seen_idx on public.accounts (last_seen_at desc);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.integration_sources(source_id),
  source_report_ref text,
  report_type text not null check (report_type in ('abuse', 'sara_response', 'safety', 'bug', 'other')),
  category text not null,
  description text not null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'dismissed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retention_until timestamptz,
  unique (source_id, source_report_ref)
);

create index if not exists reports_status_submitted_idx on public.reports (status, submitted_at desc);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.integration_sources(source_id),
  source_feedback_ref text,
  category text not null check (category in ('criticism', 'suggestion', 'bug', 'usability', 'other')),
  message text not null,
  status text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'resolved', 'dismissed')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retention_until timestamptz,
  unique (source_id, source_feedback_ref)
);

create index if not exists feedback_status_submitted_idx on public.feedback (status, submitted_at desc);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.integration_sources(source_id),
  source_account_ref text not null,
  action_type text not null check (action_type in ('suspend', 'restore', 'deactivate')),
  reason text not null,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  expires_at timestamptz,
  source_result jsonb not null default '{}'::jsonb,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'failed')),
  idempotency_key text not null unique
);

create index if not exists moderation_account_requested_idx on public.moderation_actions (source_id, source_account_ref, requested_at desc);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'owner',
  action text not null,
  target_type text not null,
  target_ref text,
  reason text,
  result text not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_created_idx on public.admin_audit_log (created_at desc);

-- No anonymous or authenticated browser access. Netlify Functions use the service-role
-- key on the server after enforcing owner/source authentication.
alter table public.integration_sources enable row level security;
alter table public.service_events enable row level security;
alter table public.accounts enable row level security;
alter table public.reports enable row level security;
alter table public.feedback enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.admin_audit_log enable row level security;

-- Register sources as pending. Replace/extend allowed event types only when the sender is ready.
insert into public.integration_sources (source_id, display_name, allowed_event_types)
values
  ('choco-ai', 'Choco AI', array['service.health','account.activity','security.signal','user.feedback_submitted','abuse.report_submitted']),
  ('sara-ai', 'Sara AI', array['service.health','security.signal','sara.response_reported','user.feedback_submitted','abuse.report_submitted']),
  ('help-center', 'Choco AI Help Center', array['service.health','user.feedback_submitted','abuse.report_submitted'])
on conflict (source_id) do nothing;


-- Owner status updates and their audit entries are atomic database operations.
create or replace function public.admin_update_report_status(
  p_id uuid, p_status text, p_actor text, p_reason text
) returns jsonb
language plpgsql
security invoker
as $$
declare
  changed public.reports%rowtype;
begin
  if p_status not in ('new', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'invalid report status';
  end if;
  update public.reports
    set status = p_status, updated_at = now()
    where id = p_id
    returning * into changed;
  if not found then return null; end if;
  insert into public.admin_audit_log (actor, action, target_type, target_ref, reason, result)
    values (coalesce(nullif(p_actor, ''), 'owner'), 'update_status', 'report', p_id::text,
            left(coalesce(p_reason, ''), 1000), p_status);
  return to_jsonb(changed);
end;
$$;

create or replace function public.admin_update_feedback_status(
  p_id uuid, p_status text, p_actor text, p_reason text
) returns jsonb
language plpgsql
security invoker
as $$
declare
  changed public.feedback%rowtype;
begin
  if p_status not in ('new', 'reviewing', 'planned', 'resolved', 'dismissed') then
    raise exception 'invalid feedback status';
  end if;
  update public.feedback
    set status = p_status, updated_at = now()
    where id = p_id
    returning * into changed;
  if not found then return null; end if;
  insert into public.admin_audit_log (actor, action, target_type, target_ref, reason, result)
    values (coalesce(nullif(p_actor, ''), 'owner'), 'update_status', 'feedback', p_id::text,
            left(coalesce(p_reason, ''), 1000), p_status);
  return to_jsonb(changed);
end;
$$;

-- Store only a keyed hash of the requester address, never the raw IP.
create table if not exists public.admin_login_attempts (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.admin_login_attempts enable row level security;

create or replace function public.admin_is_login_limited(p_ip_hash text)
returns boolean
language sql
security invoker
as $$
  select exists (
    select 1 from public.admin_login_attempts
    where ip_hash = p_ip_hash
      and (
        blocked_until > now()
        or (window_started_at > now() - interval '15 minutes' and failed_attempts >= 5)
      )
  );
$$;

create or replace function public.admin_record_login_attempt(p_ip_hash text, p_success boolean)
returns void
language plpgsql
security invoker
as $$
begin
  if p_success then
    delete from public.admin_login_attempts where ip_hash = p_ip_hash;
    return;
  end if;

  insert into public.admin_login_attempts
    (ip_hash, window_started_at, failed_attempts, blocked_until, updated_at)
  values
    (p_ip_hash, now(), 1, null, now())
  on conflict (ip_hash) do update set
    window_started_at = case
      when public.admin_login_attempts.window_started_at < now() - interval '15 minutes' then now()
      else public.admin_login_attempts.window_started_at
    end,
    failed_attempts = case
      when public.admin_login_attempts.window_started_at < now() - interval '15 minutes' then 1
      else public.admin_login_attempts.failed_attempts + 1
    end,
    blocked_until = case
      when public.admin_login_attempts.window_started_at < now() - interval '15 minutes' then null
      when public.admin_login_attempts.failed_attempts + 1 >= 5 then now() + interval '15 minutes'
      else public.admin_login_attempts.blocked_until
    end,
    updated_at = now();
end;
$$;

revoke all on function public.admin_update_report_status(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_update_feedback_status(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_is_login_limited(text) from public, anon, authenticated;
revoke all on function public.admin_record_login_attempt(text, boolean) from public, anon, authenticated;
grant execute on function public.admin_update_report_status(uuid, text, text, text) to service_role;
grant execute on function public.admin_update_feedback_status(uuid, text, text, text) to service_role;
grant execute on function public.admin_is_login_limited(text) to service_role;
grant execute on function public.admin_record_login_attempt(text, boolean) to service_role;


-- Keep the upsert target aliased for portable PostgreSQL name resolution.
create or replace function public.admin_record_login_attempt(p_ip_hash text, p_success boolean)
returns void
language plpgsql
security invoker
as $$
begin
  if p_success then
    delete from public.admin_login_attempts where ip_hash = p_ip_hash;
    return;
  end if;

  insert into public.admin_login_attempts as current_attempt
    (ip_hash, window_started_at, failed_attempts, blocked_until, updated_at)
  values
    (p_ip_hash, now(), 1, null, now())
  on conflict (ip_hash) do update set
    window_started_at = case
      when current_attempt.window_started_at < now() - interval '15 minutes' then now()
      else current_attempt.window_started_at
    end,
    failed_attempts = case
      when current_attempt.window_started_at < now() - interval '15 minutes' then 1
      else current_attempt.failed_attempts + 1
    end,
    blocked_until = case
      when current_attempt.window_started_at < now() - interval '15 minutes' then null
      when current_attempt.failed_attempts + 1 >= 5 then now() + interval '15 minutes'
      else current_attempt.blocked_until
    end,
    updated_at = now();
end;
$$;

-- Moderation state and the corresponding audit record are updated atomically.
create or replace function public.admin_finalize_moderation_action(
  p_action_id uuid,
  p_status text,
  p_source_result jsonb,
  p_actor text,
  p_reason text,
  p_source_id text,
  p_account_ref text,
  p_account_status text
) returns jsonb
language plpgsql
security invoker
as $$
declare
  changed public.moderation_actions%rowtype;
begin
  if p_status not in ('confirmed', 'failed') then
    raise exception 'invalid moderation result';
  end if;
  if p_account_status not in ('unknown', 'active', 'suspended', 'deactivated') then
    raise exception 'invalid account status';
  end if;

  update public.moderation_actions
    set status = p_status,
        confirmed_at = case when p_status = 'confirmed' then now() else null end,
        source_result = coalesce(p_source_result, '{}'::jsonb)
    where id = p_action_id
    returning * into changed;
  if not found then return null; end if;

  if p_status = 'confirmed' then
    update public.accounts
      set status_cache = p_account_status, last_status_sync_at = now()
      where source_id = p_source_id and source_account_ref = p_account_ref;
  end if;

  insert into public.admin_audit_log (actor, action, target_type, target_ref, reason, result)
    values (
      coalesce(nullif(p_actor, ''), 'owner'),
      changed.action_type,
      'account',
      p_source_id || ':' || p_account_ref,
      left(coalesce(p_reason, ''), 1000),
      p_status
    );
  return to_jsonb(changed);
end;
$$;

revoke all on function public.admin_finalize_moderation_action(uuid, text, jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_finalize_moderation_action(uuid, text, jsonb, text, text, text, text, text) to service_role;


-- Explicitly grant server-side access to the panel's tables only.
grant select, insert, update, delete on public.integration_sources to service_role;
grant select, insert, update, delete on public.service_events to service_role;
grant select, insert, update, delete on public.accounts to service_role;
grant select, insert, update, delete on public.reports to service_role;
grant select, insert, update, delete on public.feedback to service_role;
grant select, insert, update, delete on public.moderation_actions to service_role;
grant select, insert, update, delete on public.admin_audit_log to service_role;
grant select, insert, update, delete on public.admin_login_attempts to service_role;
