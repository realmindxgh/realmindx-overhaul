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
