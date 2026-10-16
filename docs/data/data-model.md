# Initial Data Model

This is a logical schema, not a claim that storage has already been provisioned. The selected database implementation must preserve these relationships and constraints.

## Entities

### `integration_sources`
- `source_id` — stable identifier, e.g. `choco-ai`, `sara-ai`, `help-center`
- `display_name`
- `enabled`
- `allowed_event_types`
- `last_event_at`
- `last_health_at`
- `health_status`
- `created_at`, `updated_at`

Secrets must not be stored in readable rows. Keep secrets in environment configuration or a secret manager.

### `service_events`
- `event_id` — unique source event identifier
- `source_id`
- `schema_version`
- `event_type`
- `occurred_at`
- `received_at`
- `subject_type`
- `subject_ref` — pseudonymous/source-owned reference
- `severity` — nullable, allow-listed value
- `data_json` — validated, minimized event payload
- `idempotency_key`
- `retention_until`

Unique constraints should prevent duplicates for both source + event ID and source + idempotency key.

### `accounts`
- `source_id`
- `source_account_ref`
- `display_label` — optional, minimized
- `status_cache` — last confirmed source status, not the enforcement authority
- `created_at`, `last_seen_at`
- `last_status_sync_at`

Unique key: `source_id + source_account_ref`. Do not store passwords, auth tokens, or unrelated profile details.

### `reports`
- `report_id`
- `source_id`
- `report_type` — abuse, Sara response, safety, bug, other
- `category`
- `description`
- `evidence_ref` or minimal approved evidence
- `status` — new, reviewing, resolved, dismissed
- `priority`
- `submitted_at`, `updated_at`, `retention_until`

### `feedback`
- `feedback_id`
- `source_id`
- `category` — criticism, suggestion, bug, usability, other
- `message`
- `status` — new, reviewing, planned, resolved, dismissed
- `submitted_at`, `updated_at`, `retention_until`

### `moderation_actions`
- `action_id`
- `source_id`
- `source_account_ref`
- `action_type` — suspend, restore, deactivate
- `reason`
- `requested_at`
- `confirmed_at`
- `expires_at` — nullable
- `source_result`
- `status` — requested, confirmed, failed
- `idempotency_key`

### `admin_audit_log`
- `audit_id`
- `actor` — owner
- `action`
- `target_type`
- `target_ref`
- `reason`
- `result`
- `created_at`

Audit records should be append-only to ordinary application operations.

## Overview metrics

Use aggregate queries over a defined time range. Display counts with a clear time window and data freshness indicator. If a source is not connected, show "Belum terhubung" rather than zero activity, because missing data is not the same as no activity.
