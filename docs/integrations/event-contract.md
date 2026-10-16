# Service Integration Contract

## Status

This document defines the contract. A source is **not connected** until its sender and the panel receiver are implemented and tested together.

## Receiver

Netlify Function route:

- `POST /.netlify/functions/ingest-event`

The route must require a source-specific credential in a request header, validate the source against the server-side integration registry, and reject requests with an unknown source or invalid signature. Do not send secrets in the JSON body or query string.

For production, prefer an HMAC signature over the raw request body with a timestamp and replay window. Each source has a different secret stored only in server-side environment variables or the selected secret store. Rotate credentials if exposed.

## Event envelope (v1)

```json
{
  "schema_version": "1",
  "event_id": "source-generated-unique-id",
  "source": "choco-ai",
  "event_type": "account.activity",
  "occurred_at": "2026-01-01T12:00:00.000Z",
  "subject": {
    "type": "account",
    "id": "source-owned-pseudonymous-id"
  },
  "data": {
    "activity": "sign_in",
    "result": "success"
  },
  "idempotency_key": "source-event-unique-key"
}
```

This is an illustrative schema. Real event types and fields must be documented before a source ships events.

## Initial allowed event categories

- `service.health`: source health and last successful heartbeat.
- `account.activity`: coarse operational event such as sign-in success/failure or account creation, without password or token data.
- `security.signal`: rule identifier, severity, timestamp, and minimal supporting metadata.
- `user.feedback_submitted`: user-submitted feedback ID, category, text supplied by the user, and status.
- `abuse.report_submitted`: report ID, category, service, user-provided description, optional relevant evidence, and status.
- `sara.response_reported`: report ID, Sara deployment/session reference, response timestamp, category, and the smallest context needed for review.

Do not ship arbitrary raw conversation logs, audio recordings, transcripts, or local memory by default. Any additional field requires a clear purpose, retention period, and notice in the relevant service.

## Required validation

- Content-Type must be JSON.
- Body size limit must be enforced.
- `schema_version`, `event_id`, `source`, `event_type`, `occurred_at`, and `data` are required.
- `occurred_at` must parse as a valid timestamp and fall within the accepted clock-skew policy.
- `source` must match the credential that authenticated the request.
- Event types must be allow-listed for that source.
- Duplicate `event_id` or `idempotency_key` values must not create duplicate records.
- Inputs must be length-limited and treated as untrusted text in the UI.
- Responses must not echo secrets or internal stack traces.

## Acknowledgements

- `202 Accepted`: event validated and durably queued/stored.
- `400 Bad Request`: invalid schema or payload.
- `401 Unauthorized`: missing/invalid source authentication.
- `409 Conflict`: idempotency conflict when it cannot safely be treated as an already-accepted duplicate.
- `413 Payload Too Large`: body exceeds configured limit.
- `429 Too Many Requests`: source rate limit exceeded.
- `503 Service Unavailable`: durable storage unavailable; source should retry with the same idempotency key.

An acknowledgement must not claim durable acceptance if the data was not stored.

## Moderation command contract

A separate source-owned API is required for account status changes. It must accept an authenticated command with:

- unique command ID;
- source-owned account ID;
- requested action (`suspend`, `restore`, or `deactivate`);
- reason/category;
- expiration time for temporary suspensions, if applicable;
- actor ID (`owner`);
- idempotency key.

The source service must independently authorize the request, validate the account, enforce the status during authentication/use, and return a confirmed result. The panel records both the request and confirmed result. If the source does not implement this contract, the UI must display the account as "not remotely manageable" rather than implying that a ban has been applied.
