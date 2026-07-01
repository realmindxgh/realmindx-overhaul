# Agent Notes

## Deployment and migration pitfalls

- Keep Alembic `revision` values at 32 characters or fewer. Production stores `alembic_version.version_num` as `VARCHAR(32)`, so long revision IDs fail during deploy when Alembic tries to record the migration.
- Be careful with Postgres `json` columns. Do not compare JSON directly with strings such as `sources = '[]'`; use JSON functions such as `json_array_length(sources) = 0`, or cast deliberately when a JSONB operator is required.
- The Codex app shell on this Windows workstation may not have `git` on `PATH`. Use `C:\Program Files\Git\cmd\git.exe` explicitly.
- If the local Git index or remote-tracking ref cannot be updated, use an alternate `GIT_INDEX_FILE` for scoped commits and verify GitHub state with `git ls-remote origin refs/heads/main` after pushing.
