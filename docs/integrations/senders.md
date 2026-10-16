# Secure Source Sender Guide

This guide is for the backend or local service that owns the event. The panel receiver is not a browser analytics endpoint.

## Receiver URL

`POST https://<your-netlify-site>/.netlify/functions/ingest-event`

Use the actual deployed panel URL in the source service's server-side environment variable, for example `PANEL_INGEST_URL`.

## Required headers

- `Content-Type: application/json`
- `x-choco-source`: one of `choco-ai`, `sara-ai`, `help-center`
- `x-choco-timestamp`: Unix timestamp in seconds
- `x-choco-signature`: HMAC-SHA256 hex digest of `<timestamp>.<exact raw JSON body>`

The source's secret is stored as a server-side environment variable in that source and must match the corresponding `INTEGRATION_*_SECRET` variable in the panel. Keep secrets unique per source.

## Node.js example (server-side only)

```js
const crypto = require("node:crypto");

async function sendPanelEvent(payload) {
  const url = process.env.PANEL_INGEST_URL;
  const secret = process.env.PANEL_INGEST_SECRET;
  if (!url || !secret) throw new Error("Panel event integration is not configured.");

  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret)
    .update(timestamp + "." + body, "utf8")
    .digest("hex");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-choco-source": payload.source,
      "x-choco-timestamp": timestamp,
      "x-choco-signature": signature
    },
    body
  });

  if (!response.ok) {
    // Retry transient failures with the same event_id and idempotency_key.
    // Never log the secret, signature, or authorization headers.
    throw new Error("Panel event was not accepted: HTTP " + response.status);
  }
  return response.json();
}
```

For a Choco AI server-side sender, set `PANEL_INGEST_SECRET` to the same random value as `INTEGRATION_CHOCO_AI_SECRET` in the panel. For Help Center, use the matching Help Center variables. Do not place this code or its secret in browser JavaScript.

## Python example (Sara/local service)

```python
import hashlib
import hmac
import json
import os
import time
import urllib.request

def send_panel_event(payload):
    url = os.environ["PANEL_INGEST_URL"]
    secret = os.environ["PANEL_INGEST_SECRET"].encode("utf-8")
    timestamp = str(int(time.time()))
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    signature = hmac.new(
        secret,
        timestamp.encode("utf-8") + b"." + body,
        hashlib.sha256
    ).hexdigest()

    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-choco-source": payload["source"],
            "x-choco-timestamp": timestamp,
            "x-choco-signature": signature,
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))
```

For Sara, send only approved operational events or the minimum context for an explicit user report. Do not upload local conversation memory, full transcripts, microphone audio, or unrelated personal content by default.

## Example event payloads

### Operational activity

```json
{
  "schema_version": "1",
  "event_id": "evt-unique-0001",
  "idempotency_key": "evt-unique-0001",
  "source": "choco-ai",
  "event_type": "account.activity",
  "occurred_at": "2026-10-16T12:00:00.000Z",
  "subject": { "type": "account", "id": "pseudonymous-account-ref" },
  "data": { "activity": "sign_in", "result": "success", "severity": "info" }
}
```

### Explicit user-submitted report about Sara

```json
{
  "schema_version": "1",
  "event_id": "evt-unique-0002",
  "idempotency_key": "evt-unique-0002",
  "source": "sara-ai",
  "event_type": "sara.response_reported",
  "occurred_at": "2026-10-16T12:05:00.000Z",
  "subject": { "type": "report", "id": "report-ref-0001" },
  "data": {
    "report_id": "report-ref-0001",
    "category": "incorrect_answer",
    "description": "User-provided description of the issue.",
    "evidence": { "response_ref": "response-ref-123" },
    "priority": "normal"
  }
}
```

The report description and evidence must be relevant and submitted for review. Do not put secrets or unrelated personal details in these fields.

## Delivery and retries

- Keep `event_id` and `idempotency_key` unchanged for retries.
- Retry timeouts, 429, and 503 with bounded exponential backoff.
- Do not retry 400 or 401 indefinitely; fix the schema or source configuration.
- A 202 response means the event was accepted for processing. Check the panel dashboard to verify it is visible.
- A source is not considered integrated until an end-to-end test confirms event delivery, persistence, display, and duplicate handling.

## Current integration boundary

The panel repository defines the receiver and the contract. Each source repository still needs its own sender code and environment variables. A static website cannot safely sign these requests in the browser because any browser-held secret can be extracted.
