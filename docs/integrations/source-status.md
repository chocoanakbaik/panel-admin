# Source Integration Readiness

This file distinguishes panel-side work from source-side work. A panel endpoint being implemented does not mean a service is connected.

| Source | Panel receiver/schema | Sender in source repository | End-to-end verification |
|---|---|---|---|
| Choco AI | Contract ready | Pending | Pending |
| Sara AI | Contract ready | Pending | Pending |
| Choco AI Help Center | Contract ready | Pending | Pending |
| Future feedback forms | Contract ready | Pending until form exists | Pending |
| Future abuse reports | Contract ready | Pending until report form exists | Pending |

## Choco AI required work

- Send an account event for account creation and relevant account activity using a pseudonymous account reference.
- Send approved operational/security events only; do not include passwords, access tokens, or unrelated profile data.
- Implement the source-side moderation endpoint described in [the moderation contract](moderation-contract.md).
- Enforce suspension/restoration/deactivation in the authentication/account backend.
- Return a confirmed persisted account status only after the source has applied the action.
- Add the panel sender secret to server-side environment configuration, never to browser JavaScript.

## Sara AI required work

- Send a health event when the service is available and relevant operational events when appropriate.
- Send `sara.response_reported` only when a report is explicitly submitted or a policy-approved safety workflow requires it.
- Do not send local memory, full conversation history, microphone audio, or transcripts by default.
- Keep the panel sender secret in the local service's protected environment configuration.

## Help Center and future forms

- Send only user-submitted feedback or reports, with a stable source reference.
- Keep the user's supplied text and evidence limited to what is necessary to review the submission.
- Show the user an appropriate notice explaining how their submission will be used.

## Integration sign-off

For each source, test:
1. Valid signed event is accepted.
2. Invalid/missing signature is rejected.
3. Stale timestamp is rejected.
4. Duplicate event is acknowledged without creating duplicate records.
5. Reused idempotency key with a different event is rejected.
6. Event is visible in the correct panel section.
7. Service outage is reflected honestly.
8. No secret or unnecessary personal data appears in logs or dashboard output.

Only mark a source connected after all applicable checks pass.
