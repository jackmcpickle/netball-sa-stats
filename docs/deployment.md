# Deployment

Deploys run through **Cloudflare Workers Builds** (git-connected, triggered on push).

## Migrations run on every build

Build/deploy commands are dashboard-only — Workers Builds ignores `custom builds` in
`wrangler.jsonc`. So the migration lives in a package script and the dashboard just calls it.

Cloudflare dashboard → Worker `netball-stats` → **Settings → Build**:

| Setting                | Value                          |
| ---------------------- | ------------------------------ |
| Build command          | _(empty — `cf:deploy` builds)_ |
| Deploy command         | `pnpm run cf:deploy`           |
| Preview deploy command | `npx wrangler versions upload` |

`cf:deploy` is `build && db:migrate:remote && wrangler deploy`. It builds itself rather
than relying on the dashboard's separate build command — an empty build command there
means `wrangler deploy` dies with `entry-point file at
"@tanstack/react-start/server-entry" was not found`, since Vite generates that entry
point. One field to configure, not two.

Migrations run before the deploy, so a failed migration aborts rather than shipping code
against a schema that isn't there. Migrations are additive, so applying before the new
code goes live is the safe order.

`d1_migrations` records what has been applied, so re-running on every build is idempotent.

### The API token needs D1 edit

Workers Builds' auto-created token grants Workers Scripts / KV / R2 — **not D1**. Without
`D1 (edit)` the migration step fails with a bare exit code 1 and no useful log output.
Add it under My Profile → API Tokens.

### Leave migrations out of the preview command

Preview builds deploy with `wrangler versions upload` but share the one production D1 —
there is no preview database. Putting `--remote` migrations in the preview deploy command
would let any pushed branch mutate production schema.

## Why this exists

The head-to-head and results pages shipped in `40ea445` querying a `games` table that had
never been created in production — `0006_games.sql` and `0007_games_is_finals.sql` were
applied locally but never remotely, so both pages 500'd on every request while passing
locally and in CI.

## Schema is not data

Migrations only create the catalogue and empty tables. Game rows come from the ingestion
pipeline (`src/pipeline/fetch/run.ts`); a fresh table renders empty pages, not errors.
