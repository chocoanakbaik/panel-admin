# Release and Deployment Strategy

## Goal

Avoid deploying incomplete work after every development commit. GitHub remains the source of truth, while Netlify deploys only the approved production branch.

## Branch policy

- `main`: release-ready production branch.
- `development`: ongoing implementation and integration work.
- Work on `development` until the full acceptance checklist passes.
- Configure Netlify's production branch as `main`.
- Do not merge into `main` merely because the UI looks complete. Authentication, storage, source integration, security, and failure paths must be tested.
- Use a deploy preview for final validation if available. Do not expose production credentials in previews.

## One planned first release

1. Finish the feature and integration contracts.
2. Complete the frontend and server-side APIs.
3. Provision the persistent data store and environment variables.
4. Connect each source that is ready and mark unimplemented sources as pending.
5. Run automated and manual acceptance tests.
6. Review security headers, logs, rate limits, and data retention.
7. Validate the production build on a preview.
8. Merge the tested release into `main` and deploy.

## Important reality

No architecture can guarantee that a deployed service will never need a fix. The goal is to reduce avoidable revisions through stable API contracts, schema versioning, automated tests, safe migrations, and staged releases. Security fixes and future source integrations may still require deployments.

## Environment variables

The current authentication foundation expects:
- `PANEL_ADMIN_KEY` — owner key, at least 24 characters.
- `PANEL_SESSION_SECRET` — separate signing secret, at least 32 characters.

Future server-side integration secrets and database credentials must be added only after the selected providers and contracts are finalized. Never put real values in this repository.

## Netlify integration note

A Git-connected Netlify site may automatically deploy each commit pushed to its configured production branch. Keeping work on `development` and leaving `main` as the production branch prevents development commits from becoming production deployments, provided the Netlify production branch is configured correctly.
