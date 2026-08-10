# RealMindX security assessment and remediation report

Date: 2026-08-10
Scope: application source, authentication and authorization, public APIs, uploads, payment flows, frontend API usage, dependency manifests, CI/CD, Nginx, and systemd configuration in this repository.

This was a defensive source/configuration assessment, not an intrusive production penetration test. Production secrets were not read, displayed, searched, or modified. No production host, database, migration, service, or deployment was changed by this audit.

## Executive summary

The review confirmed several exploitable weaknesses. The highest-risk paths were a shared temporary account password, insufficient authorization on protected upload URLs, globally disabled CSRF enforcement, anonymous customer-data lookup by email, a legacy unauthenticated numeric-order payment initializer, and automatic OAuth account linking based only on an email claim.

The confirmed application vulnerabilities have been remediated in the local/current repository state. Security regression tests were added. Dependency scans now report no known vulnerabilities. The repository also now contains a staged, local-only operational hardening layer: serialized and commit-pinned deployment, isolated dependency preparation, API readiness gates, automatic code/environment/frontend/Nginx rollback, atomic frontend publication, a non-blocking internal-account MFA rollout, and optional fail-closed ClamAV upload scanning. Infrastructure activation and Linux staging validation are still required before these controls should be deployed.

## Operational-risk hardening prepared locally

- Deployments are serialized and pinned to the exact GitHub workflow commit, preventing overlapping releases and frontend/backend commit drift.
- Python dependencies are prepared and validated in a versioned virtual environment before the live service switches to them. The previous code, virtual environment, environment file, frontend, and managed Nginx configuration are retained for automatic rollback if readiness or smoke checks fail.
- The frontend is staged and renamed into place only after the new backend reports ready. This avoids serving a partial `rsync` result or a frontend that expects a backend which has not started successfully.
- `/health` remains a lightweight liveness check. `/health/ready` verifies the database and, when their rollout flags are enabled, shared rate-limit storage and the upload malware scanner. The public response is deliberately generic.
- Admin and staff accounts receive a visible but non-blocking email-2FA recommendation, with a focused setup modal. This phase does not lock anyone out. Mandatory enforcement is intentionally deferred until enrollment and recovery procedures are complete.
- Optional ClamAV scanning occurs after structural validation and before an upload is recorded. Detected or unscanned files are deleted; scanner outages produce a retryable 503 message instead of silently accepting the file.
- Database migrations are deliberately not auto-downgraded during rollback. Every production migration must remain backward-compatible with the immediately previous application release; destructive migrations require a separate expand/migrate/contract rollout.

These changes have not been deployed, committed, pushed, or activated in production as part of this operational-risk pass.

## Confirmed findings and disposition

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| S-01 | Critical | Staff, admin, manager, and rider accounts used the same published temporary password. UI-only password rotation could be bypassed by direct API requests. | Fixed. Active create/reset flows generate unique high-entropy passwords, first-login rotation is enforced server-side across API access, and the legacy credential constant has been removed. |
| S-02 | Critical | Any authenticated user could retrieve another user's protected upload if the path leaked. | Fixed. Protected files now require ownership or an authorized internal role, and responses are private/no-store. |
| S-03 | High | Automatic CSRF checks were disabled even though authentication uses cookies. | Fixed. CSRF is enabled by default; only signed external webhooks, the Apple form-post callback, and anonymous analytics ingestion are explicitly exempt. Frontend mutations use the CSRF-aware API client. |
| S-04 | High | Production could start with a known signing-key fallback, insecure cookies, or no CAPTCHA secret. | Fixed. Production now fails closed for weak signing keys, insecure session cookies, missing/placeholder Turnstile configuration, and unsafe CORS origins. |
| S-05 | High | Anonymous order tracking accepted email alone and returned customer contact, address, and payment data. Short order references reduced the work needed to guess records. | Fixed. Tracking requires the order reference, returns a PII-minimized allowlist, limits results to one, and new references use 80 random bits. Order references no longer open invoice/receipt data. |
| S-06 | High | A legacy unauthenticated endpoint accepted numeric order IDs, initialized payment for other customers' orders, returned full order data, and accepted a caller-controlled callback URL. Donation callbacks were also caller-controlled. | Fixed. The numeric endpoint returns 410, payment verification responses are PII-minimized, and callback URLs are server-controlled. |
| S-07 | High | A new OAuth identity was automatically attached to an existing account when the provider asserted the same email. | Fixed. Email claims alone can no longer link identities; an authenticated linking workflow is required. |
| S-08 | High | Rate limiting used the proxy address rather than the real client address behind Nginx; some audit code trusted spoofable forwarded headers directly. | Fixed in application code with one-hop `ProxyFix` and `request.remote_addr`. Shared multi-worker rate-limit storage remains an operational requirement. |
| S-09 | High | Upload destination fields could be abused for path traversal, and image/document validation trusted extensions or client MIME values. | Fixed. Visibility/category values are allowlisted, paths are contained under the upload root, images are decoded and verified, PDF/DOCX structure is checked, ZIP expansion is bounded, MIME is server-derived, and category size limits are enforced. User documents are limited to PDF and DOCX. |
| S-10 | High | The frontend dependency tree included the vulnerable `nanoid` 3.3.16. | Fixed with an override to 3.3.17. `npm audit` reports zero vulnerabilities. CI now blocks high-severity Node findings and audits Python dependencies. |
| S-11 | Medium | User-provided bulk-order fields were inserted into HTML email without escaping; rich-text links allowed protocol-relative destinations. | Fixed with HTML escaping and stricter URL handling. |
| S-12 | Medium | Sessions and remember cookies rolled for 31 days; app/process/deployment hardening was incomplete. | Fixed in code/config: 12-hour permanent sessions, 14-day non-rolling remember cookies, application security headers, restored Nginx header inheritance, delivery CSP/Permissions-Policy, systemd sandboxing, least-privilege workflow permissions, secret-file ignore patterns, and dependency gates. |

## Residual risks and next actions

### Priority 0 — before treating the deployment as fully hardened

1. Provision a monitored Redis-compatible backend, configure `RATELIMIT_STORAGE_URI`, verify connectivity, and only then set `REQUIRE_SHARED_RATE_LIMIT_STORAGE=true`. The readiness gate will reject a release if shared storage is required but missing or unreachable.
2. Install and monitor `clamd`/`clamdscan`, keep signatures current, test with an approved EICAR staging sample, and only then set `UPLOAD_MALWARE_SCANNING_ENABLED=true`. Until activated, structural file validation remains in place but uploads are not antivirus-scanned.
3. Validate the deployment artifacts on a staging/production-equivalent Linux host: `nginx -t`, `systemd-analyze verify`, the first versioned-virtualenv switch, forced readiness failure/rollback, service startup, CSRF/login/payment/webhook smoke tests, and upload ownership/scanner tests. The Windows workstation cannot fully validate Nginx or systemd behavior.
4. Core production startup preconditions were redacted-checked and are present: production mode, a strong signing key, secure-cookie mode, explicit HTTPS CORS origins, and Turnstile configuration. Separately confirm every external webhook has its required signing secret and a monitored failure path; secret values were intentionally not inspected.
5. Review older order/invoice capability identifiers. New identifiers are substantially stronger, but old database rows retain their historical values. Public order-reference responses are now sanitized and order references no longer expose invoices; a rotation/migration can further reduce legacy-link risk.

### Priority 1

1. Complete the prompt-only MFA enrollment phase for every admin and staff account, then design and test enforcement with recovery codes, a break-glass account, identity verification, and support procedures. Do not enable a blocking policy until those safeguards exist.
2. Consider content-disarm/reconstruction for high-risk office documents even after ClamAV is active. Antivirus reduces risk but does not guarantee a document is safe.
3. Replace CSP `script-src 'unsafe-inline'` with nonces or hashes. Inline styles can be addressed separately after the React styling strategy is reviewed.
4. Build an explicit, re-authenticated OAuth account-linking and unlinking UI. The secure current behavior refuses implicit linking, which can inconvenience existing users who try a second provider.
5. Pin Python transitive dependencies with a reviewed lock/constraints file and pin GitHub Actions to immutable commit SHAs.

### Priority 2 / separate infrastructure assessment

1. Review VPS patching, SSH policy, firewall rules, Cloudflare settings, TLS ciphers, PostgreSQL roles/network exposure, backup encryption/restoration, log retention, and alerting.
2. Conduct an authenticated external penetration test against a staging environment, including business-logic abuse, account recovery, authorization matrices, upload malware handling, payment replay, and rate-limit behavior through the real proxy/CDN chain.
3. Add continuous secret scanning, SAST, dependency update automation, and periodic access reviews.

## Verification evidence

- Dedicated operational/security hardening suite: 18 tests passed.
- The expanded backend suite contains 461 tests. The complete run passed 460 and exposed one SQLite teardown-only foreign-key cleanup race after its test body passed. Teardown was made connection-safe, and the complete 66-test affected module then passed. Combined verification therefore has a passing result for every test; CI now runs this full suite before deployment.
- The stale legacy-teacher assertion was reconciled with the established login behavior: missing teacher application IDs are intentionally backfilled on login. The authentication/signup module passes all 21 tests.
- Production Vite build passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `nanoid` resolution: 3.3.17.
- Python `pip-audit` against `requirements.txt`: no known vulnerabilities found in the resolved dependency set.
- `pip install --dry-run -r requirements.txt` resolved Redis support without modifying the application virtual environment.
- `pip check`: no broken requirements.
- Python compile check passed.
- Deployment shell syntax validation passed, and regression assertions cover serialization, exact-commit checkout, readiness polling, rollback, and atomic frontend publication.
- `git diff --check` passed.
- Redacted high-confidence secret-signature scan of eligible tracked files found no matches. Protected environment/key files were excluded and not read.
- Read-only production checks found the API and Nginx services active, the public health endpoint returning HTTP 200, and the required Python runtime modules importable. No production state was changed.

## Important repository-state note

During the audit, concurrent work created and pushed commits on `main`/`origin/main`, including commits that absorbed some overlapping security changes. This audit did not create, push, or deploy those commits. The final verification was repeated against the resulting current HEAD plus the remaining working-tree changes.

## Files touched by this audit

- Repository/CI: `.env.example`, `.github/workflows/deploy.yml`, `.gitignore`, `package.json`, `package-lock.json`.
- Deployment: `deployment/nginx.conf`, `deployment/delivery.realmindxgh.com.conf`, `deployment/realmindx-api.service`.
- Bookshop UI: `realmindx-bookshop/BookshopApp.jsx`, `realmindx-bookshop/pages-checkout.jsx`.
- Backend core: `realmindx-site/backend/__init__.py`, `analytics.py`, `audit.py`, `config.py`, `security.py`, `upload_utils.py`, `delivery_service.py`, `invoices.py`, `rich_text.py`.
- Backend APIs: `realmindx-site/backend/api/admin.py`, `bookshop.py`, `delivery.py`, `oauth.py`, `public.py`, `whatsapp.py`.
- Portal UI: `realmindx-site/pages/AdminPortalPage.jsx`, `AuthPages.jsx`, `DeliveryPortalPage.jsx`, `UserPortalPage.jsx`.
- Frontend API client: `src/lib/apiClient.js`.
- Dependencies/tests: `realmindx-site/requirements.txt`, `realmindx-site/tests/test_account_lifecycle.py`, `test_auth_signup.py`, `test_delivery_accounts.py`, `test_security_hardening.py`.
- Report: `docs/SECURITY_AUDIT_2026-08-10.md`.

Some overlapping files were absorbed into the concurrent commits described above. Unrelated newsletter, model, CSS, attachment, and artifact changes were not authored or modified as part of this audit.

## Command/activity log

- Repository inspection: PowerShell `Get-ChildItem`, `Get-Content`, and `Select-String`; Git `ls-files`, `grep`, `diff`, `diff --check`, `status`, `log`, `reflog`, `show --stat`, and `ls-remote` using the workstation's explicit Git executable.
- Static review searches covered route decorators, authorization, uploads, outbound requests, subprocess/execution patterns, file serving, raw HTML, SQL execution, webhooks/callbacks, payment/order identifiers, and frontend direct API fetches.
- Secret scan: a redacted PowerShell signature scan over eligible tracked text files. It excluded `.env*`, private-key formats, and binary files and emitted only file/category metadata if matched.
- Node: `npm audit --json`, `npm audit --audit-level=high`, `npm ls nanoid`, `npm install --package-lock-only`, and `npm run build`, with the workstation system CA enabled for registry TLS.
- Python: `pip check`, dependency dry-run, `compileall`, focused test runs, the complete `pytest tests -q` suite, and a deterministic rerun of the affected account-lifecycle module.
- Python dependency audit: `pip-audit` was installed in an isolated system-temporary virtualenv, configured to use the Windows certificate store, and run successfully against `realmindx-site/requirements.txt`. The application virtualenv and dependency manifests were not changed by this audit tooling.
- File modifications were performed with patch-based edits. No database migration, production mutation, service restart, deployment, commit, or push was performed by this operational-risk pass.
