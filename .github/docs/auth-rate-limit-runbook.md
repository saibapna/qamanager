# Authentication rate-limit operations

## Enforced in the Cloudflare Worker

- Login and refresh requests share an atomic **IP** limit of 30 requests per rolling 15-minute window.
- Login attempts also use an atomic **account** limit of 6 attempts per 15-minute window, independent of source IP; the seventh attempt returns HTTP 429.
- Account throttle keys are HMAC-SHA256 of canonical email using `JWT_ACCESS_SECRET` (server-only). Neither an email nor a raw IP is stored in the throttle table. Do not print HMAC keys or JWT secrets.
- After successful login the account counter is removed in the same transaction as session issuance and its immutable audit entry. A failed login returns the same HTTP 401 for unknown, disabled or invalid-password accounts.
- HTTP 429 sets `Retry-After: 900` as a conservative upper bound and emits structured `qamanager_auth_limit` warning logs.
- Browser cookies are HttpOnly, Secure, SameSite=Strict. Cloudflare authentication and database connection logs/traces are enabled; alerting thresholds require the organization's notification destination.

## Incident response

First inspect Cloudflare Worker logs for `qamanager_auth_limit` and `qamanager_auth_failed`. Check the affected project and time window, unusual IP diversity, and real user impact. Avoid responding by disabling throttling or revealing whether a specific account exists.

Only a privileged database operator may unlock a legitimate user before the 15-minute window expires. Compute the exact HMAC key locally inside a protected environment using the same Worker `JWT_ACCESS_SECRET`, then delete **only** that key from `ulo_uat.auth_attempts`. Do not paste credentials or HMAC keys into public issue threads, Actions logs, or chat messages. If the account has been compromised, reset its password and revoke its refresh tokens before allowing login.

Suggested read-only operational query, which never retrieves stored passwords:

```sql
SELECT count(*) AS hot_counters
FROM ulo_uat.auth_attempts
WHERE attempts > 6 AND updated_at > now() - interval '15 minutes';
```

For retention, purge only stale throttle-counter rows older than seven days in a separately approved maintenance procedure. The log/audit event retention policy is distinct and must not be shortened by this cleanup.

## Limitations

Account-level lockout can be abused to temporarily deny login to a known victim. Its purpose is to stop distributed password guessing; it does not replace Cloudflare WAF/rate-limit rules, MFA, identity-provider protection, alerting, or an approved incident procedure. Account key rotation resets counters; rotate intentionally during security maintenance. A full P0.06/P3.07 signoff requires runtime abuse-case testing and an operational alert/incident drill.
