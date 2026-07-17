# Agent Notes

## Deployment and migration pitfalls

- Do not create Git worktrees for this repository. Keep work in this single checkout so the workspace stays simple to inspect and clean.
- Push deployable work through `main`. The GitHub Actions deployment only runs for `main`, so feature branches are not enough when the change is intended to take effect on the live site.
- Never edit, patch, git pull, restart, or deploy code directly on the Hostinger VPS as a substitute for the GitHub workflow. VPS access is for read-only diagnostics by default (logs, service status, environment presence checks). Any production code/config change must be committed locally, pushed to `main`, and deployed by GitHub Actions unless the user gives explicit emergency instructions.
- Keep Alembic `revision` values at 32 characters or fewer. Production stores `alembic_version.version_num` as `VARCHAR(32)`, so long revision IDs fail during deploy when Alembic tries to record the migration.
- Be careful with Postgres `json` columns. Do not compare JSON directly with strings such as `sources = '[]'`; use JSON functions such as `json_array_length(sources) = 0`, or cast deliberately when a JSONB operator is required.
- The Codex app shell on this Windows workstation may not have `git` on `PATH`. Use `C:\Program Files\Git\cmd\git.exe` explicitly.
- If the local Git index or remote-tracking ref cannot be updated, use an alternate `GIT_INDEX_FILE` for scoped commits and verify GitHub state with `git ls-remote origin refs/heads/main` after pushing.

## Hostinger VPS diagnostic access

- Production VPS host: `72.60.143.104` (`srv1026353`).
- Diagnostic SSH user: `codexdiag`.
- Local diagnostic private key path on this workstation: `C:\Users\skgas\.ssh\codex_realmindx_vps_ed25519`.
- Public key comment: `codex-realmindx-vps-diagnostics`.
- SSH command: `ssh -i C:\Users\skgas\.ssh\codex_realmindx_vps_ed25519 codexdiag@72.60.143.104`.
- `codexdiag` is in `adm` and `systemd-journal` so agents can read service and nginx logs. Treat this as read-only diagnostic access unless the user explicitly authorizes an emergency operational change.
- Useful read-only commands:
  - `systemctl status realmindx-api --no-pager`
  - `systemctl status nginx --no-pager`
  - `journalctl -u realmindx-api --since "2 hours ago" --no-pager`
  - `grep -h "webhooks/whatsapp" /var/log/nginx/realmindxgh_access.log /var/log/nginx/realmindxgh_access.log.1`
  - `grep -h "contact-change" /var/log/realmindx/api-access.log /var/log/realmindx/api-access.log.1`
  - `git -c safe.directory=/var/www/realmindx -C /var/www/realmindx log -1 --pretty="%h %ci %s"`
- Do not print production secrets from `/var/www/realmindx/realmindx-site/.env`. If checking configuration, print only variable names or boolean presence.
- WhatsApp webhook incident note, July 16, 2026: the callback URL verified successfully, but Meta had no active app-level `whatsapp_business_account` subscription, so incoming messages never POSTed to `/api/webhooks/whatsapp`. Fixed the app-level subscription for `object=whatsapp_business_account`, `fields=messages`; verification hit nginx at `2026-07-16 09:44 UTC`, and Graph reported `active=True`.
- Follow-up WhatsApp webhook note, July 16, 2026: after the app-level subscription was active, inbound WhatsApp challenge messages still did not reach RealMindX. Production showed contact challenge #43 pending with no `whatsapp_webhook_events`, no nginx `POST /api/webhooks/whatsapp`, and no API webhook POSTs. The root confusion was two Meta apps in the same business portfolio: `RealMindX Education` (`FACEBOOK_APP_ID=968711109336836`) is the website/social-login app in production, while `RealMindX` (`WHATSAPP_APP_ID=2009554023007456`) is the WhatsApp auth app shown in Meta Developers. Do not use `FACEBOOK_APP_ID` when generating WhatsApp system-user tokens or checking WhatsApp app subscriptions.
- Safe Meta-side fix for the above: subscribe the RealMindX WABA to the WhatsApp app using a system-user permanent token generated for app `RealMindX` (`2009554023007456`) with `whatsapp_business_management` (and normally `whatsapp_business_messaging`) access, or use Meta UI if it exposes “Subscribe app” for the WABA. The Graph action is `POST https://graph.facebook.com/v25.0/{REAL_WABA_ID}/subscribed_apps` with `Authorization: Bearer <SYSTEM_USER_TOKEN>`. Do not paste the token into chat or logs. If the user adds GitHub secrets, use `WHATSAPP_APP_ID=2009554023007456`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID=816622104862309`, and `WHATSAPP_BUSINESS_ACCOUNT_ID=1095294615457846` so the deploy workflow can persist them into production `.env`.
- WhatsApp subscription success, July 16, 2026: using the system-user token for app `RealMindX` (`2009554023007456`), Graph confirmed accessible WABAs `1044200797969069` (`RealMindX Education Ltd`, no phone numbers), `1526957368306594` (`Test WhatsApp Business Account`, test number `1234848659710604`), and `1095294615457846` (`Realmindx Education Ltd`, phone number ID `816622104862309`, display `+233 20 116 6122`). Subscribed WABA `1095294615457846` to app `2009554023007456`; Graph returned `{"success": true}` and `/{WABA_ID}/subscribed_apps?app_id=2009554023007456` confirmed the app `RealMindX` is subscribed.

## Windows shell behavior

- Avoid launching visible helper terminals while working from Codex. If a long-running local server is needed, prefer the hidden launch scripts in `scripts/` or use `Start-Process -WindowStyle Hidden`.
- Use `scripts/start-api-hidden.ps1` for the Flask API, `scripts/start-frontend-hidden.ps1` for Vite, or `scripts/start-dev-hidden.ps1` for both. They write logs under `logs/` and avoid popping up extra console windows.
- Do not use bare `Start-Process`, `cmd /c start`, or double-click-oriented `.cmd` launchers for background work unless the user explicitly wants a visible interactive terminal.

## Product UI preferences

- Prefer modal dialogs over inline expansion for account, profile, contact-change, verification, and other focused edit flows. Inline expansion should only be used when a user explicitly asks for it or when a modal would make the task clearly worse.

## Local dev login and seed guidance

- For local development in `realmindx-site`, use the SQLite fallback database at `realmindx_local.db` rather than the production PostgreSQL credentials in `.env`.
- Local UI runs on Vite at `http://127.0.0.1:5173`; backend runs on Flask at `http://127.0.0.1:5000`.
- Admin login path is `http://127.0.0.1:5173/admin/login`.
- Admin credentials from the local `.env` are:
  - Email: `admin@realmindxgh.com`
  - Password: `Admin@12345`
- A seeded teacher account is available for admin testing:
  - Email: `teacher@realmindxgh.local`
  - Password: `Teacher@123`
- If the engine cannot resolve `backend` imports from `realmindx-site`, add the repo root to `sys.path` in temporary Python seed scripts.
- Prefer running seed scripts from `realmindx-site` with the local virtualenv:
  - `cd "e:\VS Code Projects\realmindx-overhaul\realmindx-site"`
  - `$env:DATABASE_URL = "sqlite:///$PWD/realmindx_local.db"`
  - `$env:FLASK_APP = "backend:create_app"`
  - `$env:FLASK_ENV = "development"`
  - `& .venv\Scripts\python.exe scripts\seed_teacher_account.py`
- Store any future local account seeds or login changes in `AGENTS.md` so follow-up agents can reuse the same local setup and avoid repeated debugging.

## Agent Safety and Windows Environment Rules

### Scope and evidence
- Inspect the existing implementation before making conclusions.
- Never invent files, paths, commands, fields, endpoints, architecture, or evidence.
- Verify that a path exists before citing it.
- Clearly label findings as confirmed, uncertain, or not found.
- Prefer repository read, glob, grep, and list tools before terminal commands.

### Secrets and protected files
- Never read, display, quote, summarize, modify, or search:
  - `.env`
  - `.env.*`
  - credentials or secret files
  - API keys or access tokens
  - database passwords
  - private keys
  - `*.pem`
  - `*.key`
- `.env.example` may be read only when necessary.
- Never include secret values in reports, logs, diffs, or responses.

### Windows PowerShell
- The host shell is Windows PowerShell.
- Quote every path containing spaces.
- Do not use Unix-only syntax or commands, including:
  - `ls -la`
  - `grep`
  - Unix `find`
  - `head`
  - `tail`
  - `&&`
  - `||`
  - `/dev/null`
- Use PowerShell equivalents such as:
  - `Get-ChildItem`
  - `Select-String`
  - `Select-Object`
  - `Where-Object`
- For multiple commands, run them separately or use semicolons.
- Do not repeatedly retry failed Unix commands.

### Production and Git safety
- Do not deploy.
- Do not apply production migrations.
- Do not commit or push unless explicitly instructed.
- Do not delete production data or uploaded files.
- Ask before running destructive, irreversible, or production-affecting commands.
- Report all files changed, commands run, tests run, and remaining risks.