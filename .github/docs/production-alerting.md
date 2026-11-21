# QA Manager automated production incident alerts

The GitHub Actions `production-api-smoke.yml` job runs on every `main` push and every 30 minutes. It checks the deployed Cloudflare API status, PostgreSQL health, unauthorized project/defect/evidence/dashboard access, and invalid login rejection.

## Incident lifecycle

- **Failure:** the workflow creates a GitHub Issue titled `[PRODUCTION INCIDENT] QA Manager API smoke failed`, with a link to the failed run. Subsequent failures comment on the existing open incident instead of opening duplicates.
- **Recovery:** the next successful smoke run automatically closes that matching incident and posts the recovery run URL.
- Workflow executions are serialized to prevent duplicate alert creation during overlapping push/schedule events. GitHub's repository token is used with `issues: write`; no Cloudflare or database secret is needed by the issue-reporting steps.
- Operators should subscribe to repository Issue notifications or connect an approved alert destination. GitHub issue creation is not a configured phone/SMS/email paging system. The GitHub Actions run result remains the authoritative evidence of each smoke probe.

## Response

Check the failing endpoint in the linked run. Verify the current Worker deployment version, preserved HYPERDRIVE/JWT/PROJECT_LIVE/BROWSER bindings, Cloudflare Worker errors/log traces, and Supabase database status before making a rollback decision. Do not paste bearer tokens, cookies or database passwords into the GitHub incident issue. Review `admin-ui/README-cloudflare.md` for automatic rollback behavior and database migration caveats.

Do not mark master audit P3.07 complete based solely on this notification channel: independent alert delivery validation, backup/restore drills, R2/object storage enablement, and retention evidence remain outstanding.
