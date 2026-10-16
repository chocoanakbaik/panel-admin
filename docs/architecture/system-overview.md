# Choco Panel Admin — System Architecture

## Purpose

Choco Panel Admin is the owner-only control plane for the Choco service ecosystem. It provides an aggregated operational view of Choco AI, Sara AI, the Choco AI Help Center, user feedback, abuse reports, moderation decisions, and service health.

The panel is not a general-purpose surveillance tool. It only processes information necessary to operate, secure, moderate, and improve Choco services.

## Architecture boundaries

1. **Admin web UI** — dashboard, filters, account review, report queues, feedback, audit history, integration health.
2. **Admin API (Netlify Functions)** — authenticates the owner, validates source events, enforces authorization, serves paginated data, and handles moderation workflows.
3. **Persistent data store** — durable records for events, reports, feedback, account status, integration registry, and audit events. Browser memory/localStorage is not a source of truth.
4. **Service adapters** — explicit API contracts for each source. A service is not integrated merely because its repository exists; it must send authenticated events and, where supported, expose a moderation API.
5. **Moderation bridge** — delivers account suspension/restore commands to the source service that owns the account. The panel must never pretend an action succeeded if the source service did not confirm it.
6. **Observability** — health checks, structured error identifiers, integration status, and admin audit trail without logging secrets or unnecessary conversation content.

## Data flow

```text
Choco AI ───────┐
Sara AI ────────┤  authenticated event/API contracts
Help Center ────┤ ───────────────────────────────┐
Feedback forms ─┤                                ▼
Abuse reports ──┘                         Admin API / Functions
                                                   │
                              ┌────────────────────┼───────────────────┐
                              ▼                    ▼                   ▼
                         Data store          Validation/rules      Audit log
                              │                    │                   │
                              └────────────────────┼───────────────────┘
                                                   ▼
                                          Owner-only dashboard
                                                   │
                                      reviewed moderation action
                                                   ▼
                                      source service moderation API
```

## Core dashboard sections

- **Overview:** event volume, open reports, unresolved feedback, recent security events, service connectivity, and data freshness.
- **Services:** Choco AI, Sara AI, Help Center, and future services with connection/health status and last successful event.
- **Accounts:** source-owned account identifier, account status, relevant service metadata, reviewed flags, and moderation history.
- **Activity:** filtered operational/security events; do not default to collecting full conversations.
- **Reports:** abuse reports and reports about Sara AI responses, with status, category, assigned action, and limited supporting context.
- **Feedback:** criticism, suggestions, bug reports, and product feedback.
- **Moderation:** suspend, restore, or deactivate only when the account-owning service confirms the action.
- **Audit log:** sensitive admin actions with actor, timestamp, target, reason, and result.
- **Settings/integrations:** configured sources, key rotation instructions, event health, retention settings, and system diagnostics.

## Integration principles

- Each source gets its own server-side secret. Never embed source secrets in client-side JavaScript.
- Events must be versioned, validated, timestamped, deduplicated, and scoped to a known source.
- Use idempotency keys so retries do not create duplicate reports/events.
- Reject unknown event types and oversized payloads.
- Use pagination and time-window filters for lists.
- Keep account identifiers pseudonymous where possible.
- Never log passwords, session cookies, API keys, or full authorization headers.
- Do not ingest Sara's private/local conversation memory wholesale. Send only explicitly approved operational metadata and the minimal context needed for a user-submitted report or a reviewed safety incident.

## Important constraints

- A frontend-only static page cannot securely protect secrets or enforce owner-only authorization.
- A Netlify Function can receive events, but durable cross-deployment records require a persistent data store.
- Choco AI account suspension requires Choco AI's account/authentication backend to enforce the status. A panel-only status badge is not a real ban.
- Sara AI running locally cannot report to the hosted panel unless an explicit, opt-in-capable integration sends approved event metadata.
- No integration should be marked "connected" until a real end-to-end test confirms event delivery, storage, display, and error handling.
