# Agent Notes

## Deployment and migration pitfalls

- Do not create Git worktrees for this repository. Keep work in this single checkout so the workspace stays simple to inspect and clean.
- Push deployable work through `main`. The GitHub Actions deployment only runs for `main`, so feature branches are not enough when the change is intended to take effect on the live site.
- Keep Alembic `revision` values at 32 characters or fewer. Production stores `alembic_version.version_num` as `VARCHAR(32)`, so long revision IDs fail during deploy when Alembic tries to record the migration.
- Be careful with Postgres `json` columns. Do not compare JSON directly with strings such as `sources = '[]'`; use JSON functions such as `json_array_length(sources) = 0`, or cast deliberately when a JSONB operator is required.
- The Codex app shell on this Windows workstation may not have `git` on `PATH`. Use `C:\Program Files\Git\cmd\git.exe` explicitly.
- If the local Git index or remote-tracking ref cannot be updated, use an alternate `GIT_INDEX_FILE` for scoped commits and verify GitHub state with `git ls-remote origin refs/heads/main` after pushing.

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
