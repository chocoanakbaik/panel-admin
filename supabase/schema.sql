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
