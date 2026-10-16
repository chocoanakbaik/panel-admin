# Account Moderation Contract

## Why this is separate

Choco Panel Admin does not own Choco AI's account database or authentication rules. A label in the panel is not a ban. The service that owns the account must enforce the action during authentication and requests, then confirm the resulting status.

## Panel endpoint

The owner UI sends a request to:

`POST /.netlify/functions/admin-moderation`

The panel requires a valid owner session, same-origin request, a non-empty reason, and a unique idempotency key. It records the request, calls the configured source endpoint, and marks the result confirmed only when the source returns an explicit confirmation matching the requested account status.

## Choco AI source endpoint

Set `MODERATION_CHOCO_AI_URL` in the panel to the HTTPS endpoint implemented by the Choco AI backend. Set `MODERATION_CHOCO_AI_SECRET` to a separate random shared secret stored only server-side in both services.

The panel sends these headers:

- `x-panel-source: choco-panel-admin`
- `x-panel-timestamp`: Unix timestamp in seconds
- `x-panel-signature`: HMAC-SHA256 hex of `<timestamp>.<exact raw JSON body>`
- `x-panel-action-id`: panel action UUID

The source must validate the HMAC with a constant-time comparison and reject timestamps outside a short replay window. It must also verify the request's source identity, validate the payload, and deduplicate by `action_id` and `idempotency_key`.

## Command body

```json
{
  "action_id": "panel-action-uuid",
  "source_id": "choco-ai",
  "source_account_ref": "source-owned-account-reference",
  "action_type": "suspend",
  "reason": "Reviewed reason for moderation",
  "actor": "owner",
  "expires_at": null,
  "idempotency_key": "unique-client-generated-key"
}
```

Allowed `action_type` values: `suspend`, `restore`, `deactivate`.

## Required source response

The source must return JSON with an explicit confirmed state:

```json
{
  "ok": true,
  "status": "confirmed",
  "account_status": "suspended",
  "command_ref": "source-command-reference"
}
```

Expected status by action:
- `suspend` → `suspended`
- `restore` → `active`
- `deactivate` → `deactivated`

If the source is unavailable, rejects the command, returns an ambiguous status, or does not return the expected account status, the panel records a failed/unconfirmed action and must not claim the account status changed.

## Source enforcement requirements

The Choco AI backend must:
1. Look up the account by its own stable identifier.
2. Validate the requested action and expiry.
3. Persist the account status in the system that authenticates/serves the account.
4. Enforce the status on future authenticated requests, not just in the UI.
5. Return the confirmed persisted status.
6. Make repeated requests with the same action ID idempotent.
7. Keep its own security/audit records and avoid logging secrets.

## Moderation safety

- The owner must supply a reason for every action.
- A reversible suspension is preferred when a review is still in progress.
- Permanent deactivation requires a deliberate confirmation in the UI.
- Automated security signals are not proof by themselves.
- If the source backend has not implemented this contract, the panel's controls stay disabled and no moderation action is sent.
