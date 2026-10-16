# Release Acceptance Checklist

A release is not complete until the applicable items are checked with evidence.

## Owner authentication
- [ ] Missing server secrets cause a safe failure.
- [ ] Wrong owner key is rejected with a generic message.
- [ ] Login rate limit works.
- [ ] Valid login creates a signed, HttpOnly, Secure, SameSite session.
- [ ] Expired or modified session is rejected by every protected API.
- [ ] Logout expires the cookie.
- [ ] Protected APIs return 401/403 without a valid owner session.
- [ ] No secret is present in HTML, CSS, browser JavaScript, source maps, or logs.

## Data and API
- [ ] Durable storage is configured and tested.
- [ ] Lists use pagination and bounded date filters.
- [ ] Malformed, oversized, unknown-version, and unknown-source payloads are rejected.
- [ ] Source authentication is distinct from owner authentication.
- [ ] Duplicate events do not create duplicate records.
- [ ] Storage outage does not falsely acknowledge an event as stored.
- [ ] Untrusted text is rendered safely.
- [ ] Retention/expiry behavior is documented and tested.

## Dashboard
- [ ] Loading, empty, error, and disconnected states are distinct.
- [ ] Disconnected sources are not shown as having zero activity.
- [ ] Time ranges and last-updated timestamps are visible.
- [ ] Filters and search work without loading unbounded datasets.
- [ ] Layout works on desktop and narrow screens.
- [ ] UI follows Choco AI dark navy / blue-purple design tokens.
- [ ] Keyboard focus, labels, contrast, and error announcements are usable.

## Reports and feedback
- [ ] Reports can be searched, filtered, opened, and status-updated.
- [ ] Feedback can be searched, filtered, and status-updated.
- [ ] Evidence is limited to the relevant user-submitted context.
- [ ] All sensitive changes create an audit record.

## Moderation
- [ ] Source account is identified unambiguously.
- [ ] Reason is required.
- [ ] Action uses an idempotency key.
- [ ] Panel shows requested, confirmed, and failed states separately.
- [ ] The source service confirms enforcement before UI displays suspension/ban as active.
- [ ] Restore/reversal path is tested.
- [ ] Automated signals alone do not silently impose permanent sanctions.

## Integrations
- [ ] Each source has a documented versioned event contract.
- [ ] Each source secret is unique and stored server-side.
- [ ] Event signature, timestamp, replay, and rate-limit checks work.
- [ ] End-to-end event test verifies delivery, persistence, dashboard display, and duplicate handling.
- [ ] Sources without implemented senders are clearly marked "Belum terhubung".

## Release
- [ ] Build and automated tests pass.
- [ ] Environment variables are set in Netlify, not in Git.
- [ ] Preview deployment verified before merging to main.
- [ ] Production branch is confirmed as main.
- [ ] Rollback procedure is documented.
