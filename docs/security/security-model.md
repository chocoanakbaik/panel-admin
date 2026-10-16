# Security and Privacy Model

## Authentication

- Keep the owner access key server-side in `PANEL_ADMIN_KEY`; never compile it into browser assets.
- Keep `PANEL_SESSION_SECRET` separate from the access key and rotate it if exposed.
- Use short-lived, signed sessions with HttpOnly, Secure, SameSite cookies.
- Validate the session on every protected API request; hiding the dashboard in JavaScript is not authorization.
- Add login rate limiting and generic error messages to reduce brute-force and account-enumeration risk.
- Never return secrets, signatures, cookie values, or detailed internal errors to the browser.
- Logout must expire the server-issued cookie and return a no-store response.

## Authorization

- Owner-only access by default.
- Every API route must explicitly declare whether it requires an owner session or a source credential.
- Source ingestion credentials must not be accepted as owner credentials.
- Moderation endpoints must require a valid owner session, CSRF protections, reason text, and an audit record.
- Do not add staff accounts or broader roles unless explicitly designed and reviewed.

## Request protection

- Accept only intended HTTP methods and JSON content types.
- Validate payload shape, length, timestamp, enum values, and source identity.
- Use request size limits, rate limits, replay protection, and idempotency.
- Apply a restrictive Content Security Policy and standard security headers.
- Avoid rendering untrusted report/feedback text through `innerHTML`; use safe text rendering.
- Use server-side input validation even if the browser also validates fields.

## Data minimization

- Store only data needed for platform operations, security, moderation, user-submitted reports, and product improvement.
- Do not collect unrelated personal activity.
- Do not store passwords, authentication tokens, secret keys, or session cookies.
- Avoid full conversation capture by default. For a report, retain only the user-submitted description and the smallest relevant excerpt/metadata needed for review.
- Set and document retention periods; support deletion/expiry for records that are no longer needed.
- Keep access to sensitive report evidence limited to the owner session and do not expose it through public/static endpoints.

## Moderation safeguards

- Automated flags are review signals, not proof on their own.
- Require a reason and record the target account, source, actor, timestamp, action, and outcome.
- Prefer temporary suspension with a defined expiry for reversible uncertain cases.
- Show the difference between "action requested", "confirmed by source", and "failed".
- Never display "banned" unless the account-owning service confirms enforcement.
- Provide a way to correct or reverse a mistaken action and preserve the audit history.

## Operational security

- Secrets belong in deployment environment settings or a dedicated secret manager, never in Git.
- Separate development and production credentials.
- Use a persistent database with least-privilege access and server-only credentials.
- Do not include personal data or secrets in logs, screenshots, test fixtures, or error messages.
- Test missing-secret, invalid-session, expired-session, replayed-event, duplicate-event, malformed-payload, and storage-outage cases before release.
