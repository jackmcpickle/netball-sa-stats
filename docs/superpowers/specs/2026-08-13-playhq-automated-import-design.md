# Automated PlayHQ imports on Cloudflare — design

Date: 2026-08-13

Companion to [PLAN.md](../../../PLAN.md) (two-stage fetch → CSV → D1 pipeline)
and [docs/playhq-api.md](../../playhq-api.md). Revises the original
**“No Worker-side sync”** rule.

## Problem

The live site is a Cloudflare Worker reading D1. Fresh PlayHQ data still
arrives by hand:

1. `pnpm exec tsx scripts/fetch-playhq.ts --refresh --games --year=2026` on a
   residential machine, writing `data/*.csv` and `data/raw/*.json`.
2. Commit the CSV diff.
3. `pnpm exec tsx scripts/import-csv.ts --remote` via `wrangler d1 execute`.

That was correct for a one-off backfill. It is the wrong loop for an in-progress
season: Saturday scores sit in PlayHQ until someone remembers to scrape. The
site already has fixtures, ladders, and head-to-head — they should move when
PlayHQ does.

PLAN.md forbade Worker-side sync for two reasons that no longer hold:

| Original assumption                  | Today                                                                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| “A Worker cannot run a browser.”     | Fetch is GraphQL (`src/pipeline/fetch/playhq-client.ts`), not Playwright.                                                                                                                                                                  |
| “Datacenter IPs get CloudFront 403.” | The HTML org page still 403s on a default UA. The GraphQL endpoint with `Origin: https://www.playhq.com` returned HTTP 200 from this cloud environment for `discoverCompetitions`. Transient 403/502 still happen and are already retried. |

The pipeline itself is worth keeping: rate-limited fetch, raw capture, pure
validate, idempotent upsert. What changes is **where it runs** and **what
stores the raw capture**.

## Constraints (do not regress)

- **~1 req/sec** to `api.playhq.com`, identifying `User-Agent`, required
  `Origin` / `tenant` headers. Do not fan-out parallel PlayHQ calls.
- **Idempotent upserts.** `generateImportSql` already `ON CONFLICT`s. Re-runs
  must not duplicate games or invent teams.
- **Validate before write.** `ImportValidationError` aborts the D1 projection.
  A broken scrape must not ship.
- **One writer per catalogue table.** `competitions` / `grade_weights` stay
  migration-owned.
- **Completed seasons stay still** unless an operator asks for a refresh.
  Cron imports every catalogued season PlayHQ currently marks `ACTIVE`
  (today: AMND / Premier League / Reserves 2026). When a season flips to
  `COMPLETED`, cron stops touching it; freeze the final ladder with a
  manual trigger `{ years: [2026], games: true }`.
- **CSV-in-git remains the rebuildable archive** for finished seasons. D1 is
  still a projection. Automation must not make D1 the only copy of a capture.
- Worker CPU is cheap here (I/O-bound). Wall-clock at 1.2 s/request for the
  current season is ~2 minutes (2026: 46 grades × ladder+games, plus discovery).
  A full PlayHQ-era refresh is ~5–7 minutes. Durability matters more than
  speed: a mid-run 403 must not restart from grade 1.

## Approaches

### A — `scheduled()` does fetch + import in one invocation

Cron on the existing `netball-stats` Worker. Paid cron CPU is 15 minutes when
the interval is ≥ 1 hour; waiting on `fetch()` does not count. Current-season
volume fits.

**For:** fewest new products; one script.

**Against:** not durable. A 403 burst that sleeps 10 s × attempt, or a D1
timeout on the games upsert, restarts the whole run. No per-grade progress.
The original CLI already needed that retry loop; putting it in one isolate
recreates the same fragility on a worse IP reputation.

Reject for anything that talks to PlayHQ.

### B — Cron + Queue, one message per grade

Cron discovers seasons/grades, enqueues grade ids. A queue consumer fetches
ladder+fixture, writes R2, upserts that grade. DLQ for poison grades.

**For:** per-grade retry; natural back-pressure; scales if more orgs arrive.

**Against:** PlayHQ etiquette is serial. Parallel consumers will 403-storm
unless a Durable Object token-bucket serialises them — at which point the
queue is a rate-limited work list, not a fan-out. Assembling a
validate-the-whole-season gate after “all grades done” needs a coordinator.
Two handlers, a queue, a DLQ, and a lock for a ~50-grade weekly job.

Keep in reserve if we ever ingest many orgs at once. Too much machinery now.

### C — Workflow, cron on the binding, R2 raw capture, D1 upsert (recommended)

A `PlayHqImportWorkflow` on the same Worker. Cron is declared on the Workflow
binding (`schedules` in `wrangler.jsonc`, shipped June 2026) so there is no
separate `scheduled()` handler. Each GraphQL call is a `step.do` with
exponential retry; raw JSON goes to R2; transform/validate/upsert are later
steps using the existing pure pipeline.

**For:** matches the job (long, flaky, serial, restartable). Step retries
replace the hand-rolled 403 backoff. R2 replaces `data/raw/` for live
captures (grade fixture payloads are ~330 KB, over KV’s comfort zone and
over a 1 MiB step-return if we ever batch). D1 writes stay in-process
(`env.DB.batch`), not `wrangler d1 execute`. Observability is already on.

**Against:** need a storage port so fetch no longer imports `node:fs`; need a
Worker entry that exports the Workflow class next to TanStack Start’s
`fetch`. First production run is a spike: prove PlayHQ from a **Worker
isolate**, not only from this VM.

This is the fit.

## Decision

**C.** Cron-triggered Workflow, plus a password-gated `/admin` page that
lists `import_runs` and can start a run. Current season, ladders + games,
every Sunday morning Adelaide time. Raw captures in a new R2 bucket.
Validated upserts into the existing D1. Git CSV stays the human-reviewed
archive. No Queues, no Browser Rendering, no home tunnel unless the
Worker-isolate spike fails.

## Architecture

```
                    wrangler.jsonc schedules
                    "30 22 * * SAT"   (Sun 08:00 ACST / 09:00 ACDT)
                              │
                              ▼
                    PlayHqImportWorkflow
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
     api.playhq.com      R2 playhq-raw         D1 netball-stats
     (serial GraphQL)    (raw JSON + meta)     (projection)
           │                  │                  │
           └────── transform / validate ─────────┘
                    (existing pipeline, no CSV)
```

Manual operators still exist:

- Password-protected `/admin` — run history, in-flight status, and “Run
  import” (see **Admin UI** below).
- `wrangler workflows trigger` as a break-glass if the UI is down.
- CLI `scripts/fetch-playhq.ts` + `scripts/import-csv.ts` for local work and
  for rebuilding D1 from git CSV (disaster recovery, schema experiments).

### Why R2, not git, for live raw

Git CSV diffs are how a human notices a silent scraper bug. A Worker cannot
commit. R2 keeps the capture; D1 is queryable the same hour; a later
`scripts/dump-csv.ts` (optional, not required for v1) can emit CSV from D1
or R2 so a weekly PR still exists for finished-round review.

Completed seasons already in `data/*.csv` are not rewritten by cron.

## Components

### 1. Storage port

`playhq-client.ts` and `fetch/run.ts` talk to `node:fs` today. Extract:

```
type CaptureStore = {
    read(key: string): Promise<unknown | undefined>;
    write(key: string, data: unknown, capturedAt: number): Promise<void>;
};
```

- Node CLI: filesystem under `data/raw/` (current behaviour, including
  `captured-at` sidecar).
- Worker: R2 keys `raw/{operation}_{id}.json` plus custom metadata
  `captured-at`.

`runFetch` already returns structured rows (`FetchReport` + in-memory maps).
Stop requiring a write to `data/*.csv` inside the Worker path; CSV write
stays a CLI adapter.

### 2. D1 import executor

`createWranglerExecutor` shells out because the CLI is not inside workerd.
Add `createD1Executor(db: D1Database)` that runs `queryAll` / `batch` on
`env.DB`, chunked with the existing `DEFAULT_CHUNK_SIZE` (100). Tests keep
`createSqliteExecutor`. The SQL text from `generateImportSql` does not
change.

Club identity on automated runs loads `clubs` + `club_aliases` from D1 into
`ClubRegistry`, not from git CSV. New PlayHQ organisations still get a slug
on first sight; log them as warnings so a human can curate later.

### 3. Workflow

```
PlayHqImportWorkflow
  params: { years?: number[]; games?: boolean }
  cron default: { games: true }  // years omitted → every ACTIVE catalogued season
```

`years` on a manual run is an explicit start-year list and implies those
seasons even if PlayHQ already marked them `COMPLETED`.

**Cache vs replay.** The CLI’s `cachedGraphQL(..., refresh)` reads `data/raw`
so a local re-run can be offline. The Workflow does **not** use that
cache-first path. Each PlayHQ `step.do` always hits the network on its first
successful attempt; Workflows then replays the _step result_ (the R2 key) if
a later step fails. Last week’s R2 object is an audit copy, not a cache hit.
Do not thread CLI `--refresh` into the Worker.

Steps (deterministic names, R2 keys not payloads as step returns):

1. `lock` — timestamp taken **inside** this step. Instance id
   `playhq-{iso}` (unique per attempt, so a same-day admin run does not
   collide with cron). If any `import_runs` row is `running`, insert this
   attempt as `skipped` and exit. Otherwise insert `running` and continue.
2. `discover-{orgId}` — `discoverCompetitions` for AMND + Netball SA.
3. `select-seasons` — in-scope catalogued seasons that are `ACTIVE`, or the
   `years` override. Return season ids only.
4. `grades-{seasonId}` — `gradeListDiscoverSeason` per selected season.
5. `ladder-{gradeId}` then `fixtures-{gradeId}` — `step.sleep('2 seconds')`
   between PlayHQ calls (Workflows sleep units are seconds/days; 2 s still
   respects the 1 req/sec etiquette). Retry: 6 attempts, 10 s delay,
   exponential (same budget as today’s client). On success, `R2.put`,
   return `{ key }`.
6. `transform` — existing `processGrade` / `toGameRows` over R2 objects +
   D1 club registry. Must not return the full row set if it would exceed
   1 MiB; write a staged JSON to R2 (`runs/{id}/import.json`) and return
   the key.
7. `validate` — `validateImportData` on that payload. Failure fails the
   workflow; D1 is untouched.
8. `upsert` — `generateImportSql` + `createD1Executor`. One step covering
   every chunk; a mid-batch D1 error retries the whole upsert (SQL is
   idempotent), so D1 is not left “half a new round”.
9. `record` — update the `import_runs` row (`ok` or `error`, counts,
   warnings). Workflow instance retention is 30 days on paid; this table
   is the durable log. A `run()` `catch` also updates the row if an
   earlier step throws.

Do **not** `Promise.all` the PlayHQ steps. Serial is the product.

### 4. Bindings (`wrangler.jsonc`)

- Existing `DB`.
- New R2 bucket `netball-stats-playhq-raw`, binding `PLAYHQ_RAW`.
- Workflow binding `PLAYHQ_IMPORT`, class `PlayHqImportWorkflow`,
  `schedules: ["30 22 * * SAT"]`.
- Secrets `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` (`wrangler secret put`,
  never in `wrangler.jsonc`).

No KV. No Queue. No Browser Rendering. No `IMPORT_TRIGGER_TOKEN` — the
admin session is the trigger.

Mcpickle’s account already has unrelated R2 buckets; this one is new and
scoped to this Worker.

### 5. Worker entry

`wrangler.jsonc` currently has `"main": "@tanstack/react-start/server-entry"`.
Workflows need the class exported from the same script. Wrap that entry
(thin `src/worker.ts`) so default `fetch` still comes from TanStack Start
and `PlayHqImportWorkflow` is a named export. Do not put fetch/import logic
in the wrapper.

Admin HTTP lives on Start routes (`/admin/*`), not on a second Worker.

### 6. `import_runs` table

Small, additive migration. This is the admin page’s data source, not a
public query.

Columns: `id`, `instance_id`, `started_at`, `finished_at`, `status`
(`running` | `ok` | `error` | `skipped`), `years_json`, `games`,
`seasons`, `grades`, `teams`, `results`, `games_count`, `warnings_json`,
`error_text`.

Insert a `running` row in the Workflow `lock` step (so the admin page
sees an in-flight import before upsert). Update it in `record`, and in a
`run()` catch that marks `error` if a later step throws. A crash before
`lock` is invisible; that is acceptable.

## Admin UI

A one-operator area to see whether Sunday’s import ran, what it wrote, and
to kick a run without `wrangler`. Not linked from the public nav.

### Auth approaches

| Approach                               | Verdict                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare Access on `workers.dev`** | One-click Access protects the **whole** Worker. Rankings must stay public. Reject.                                                    |
| **Access on `/admin*` only**           | Needs a custom domain and a Zero Trust path policy. Right later, wrong now — the site is `workers_dev: true` with no custom hostname. |
| **HTTP Basic Auth**                    | Browser prompt, no logout, grim on a phone. Reject as the UI.                                                                         |
| **Shared password + signed cookie**    | Form at `/admin/login`, HttpOnly cookie, same site chrome. Matches “password-protected” and works on `workers.dev`. **Do this.**      |

Access can wrap `/admin*` later if a custom domain lands. The cookie gate
stays as defence in depth; it does not disappear.

### Session

- Secrets: `ADMIN_PASSWORD` (memorable, operator-chosen) and
  `ADMIN_SESSION_SECRET` (random 32 bytes). Both via `wrangler secret put`.
- Login hashes the submitted password and the stored password with HMAC-SHA256
  keyed by `ADMIN_SESSION_SECRET`, then `timingSafeEqual` on the 32-byte
  digests (never string `===`, never compare raw lengths).
- Cookie `nod_admin`: `exp.<unix>.<hmac>`, HttpOnly, Secure, SameSite=Strict,
  Path=`/`, 7-day expiry. HMAC covers `exp.<unix>`. Path is `/` (not
  `/admin`) so TanStack Start server functions, which do not live under
  `/admin`, still receive the cookie. Public loaders ignore it.
- Failed login: same generic error, no user enumeration, no account lock
  machinery. One operator.
- Logout clears the cookie. Changing `ADMIN_PASSWORD` does not revoke
  cookies; rotating `ADMIN_SESSION_SECRET` does.

`/admin/login` is the only `/admin` route that does not require the cookie.
Everything else `beforeLoad`s: missing/invalid cookie → redirect to login
with `?next=`. Unauthenticated `/admin` is 302, not 404 — a secret URL is
not access control.

`robots` meta on every `/admin*` page: `noindex, nofollow`. No sitemap
entry. No `Admin` item in `SiteHeader` `NAV`.

### Pages

Same `RootLayout` (header/footer) so it looks like the rest of the site.
Admin pages add a Sign out control in the page body, not the public nav.

**`/admin/login`** — password field, submit. After success, go to `next` or
`/admin`.

**`/admin`** — one page, no pagination (weekly cron → tens of rows/year).

1. Status strip: last run (time, status), and if a row is `running`, “Import
   in progress” with elapsed time. No live step list in v1 (Workflow
   dashboard remains the debugger).
2. **Run import** button. Starts `PLAYHQ_IMPORT.create` with cron defaults
   (`games: true`, ACTIVE seasons). Disabled while any row is `running`.
   Optional collapsed fields: `years` (comma-separated start years) for a
   completed-season freeze. Not a public button.
3. Table, using the existing `Table` primitives (not `DataTable` — that
   component is wired to championship pagination). Columns: started
   (Adelaide-local), status, seasons, grades, games, warnings, duration.
4. Selected row: `error_text` if any, then the warning list (new clubs,
   unresolved teams, played/W+D+L mismatches) — the same strings the CLI
   already prints.

No second route for detail. No charts. No raw R2 browser.

### Server shape

Follow the existing DDD seam: `ImportRunsRepo` + `AdminService` behind
`createServices`. Routes call `createServerFn` like every other page.
Auth helpers live in `src/server/admin-auth.ts` (cookie parse/sign/verify,
password compare) and are unit-tested with a fake secret — they do not
touch D1.

`Run import` is a POST server function that checks the session, refuses if
a `running` row exists, then `env.PLAYHQ_IMPORT.create(...)`.

### Testing

- Password compare: equal, unequal, empty, wrong length — all
  `timingSafeEqual` paths.
- Cookie: valid, expired, tampered HMAC, missing → redirect.
- Loader: unauthenticated `/admin` never returns run rows (redirect before
  query).
- Admin table: fixture a handful of `import_runs` in the sqlite harness;
  assert status strip and warning panel.

## Error handling

| Failure                                | Behaviour                                                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transient PlayHQ 403/502               | Step retry, exponential, up to 6.                                                                                                                                                      |
| Persistent PlayHQ failure on one grade | Fail the workflow after retries. Do not upsert a partial season. Re-run: Workflows replay successful steps (R2 keys already written) and only retries the failed grade’s network call. |
| Validation error                       | Fail before `upsert`. Previous D1 data remains.                                                                                                                                        |
| D1 batch error                         | Retry the upsert step only (SQL is idempotent).                                                                                                                                        |
| Overlapping cron or admin “Run import” | `lock` inserts `skipped`; admin button stays disabled while any row is `running`.                                                                                                      |
| New club / unresolved fixture team     | Same as CLI: warn, skip invented teams, never invent.                                                                                                                                  |

If the Worker-isolate spike shows **standing** 403 (not transient), stop.
Fall back is a Cloudflare Tunnel on a home machine exposing a tiny
`POST /graphql-proxy` that the Workflow calls instead of `api.playhq.com`.
Browser Rendering is the wrong tool: we already have the query documents,
and a headless browser still egresses from Cloudflare.

## Testing

- Keep existing fetch/import unit tests. They prove transform + validate.
- New: `CaptureStore` fake (in-memory map) so `cachedGraphQL` tests without
  fs or R2.
- New: `createD1Executor` against the in-memory sqlite used by
  `import/run.test.ts` (same SQL).
- Workflow: `cloudflare:test` introspector for “discover → one grade →
  validate → upsert” with PlayHQ mocked at the store/client boundary. Do
  not hit PlayHQ from CI.
- Admin auth and `/admin` loader tests as listed under **Admin UI**.
- Spike (manual, once): `wrangler deploy` of a throwaway fetch step, or
  `wrangler dev --remote`, one `discoverCompetitions` call. Record HTTP
  status in this spec’s follow-up note. Implementation does not proceed to
  cron-on-production without that.

### Follow-up: Worker-isolate probe (2026-08-13)

The isolate probe was **not run** from the cloud-agent environment that
landed Tasks 1–9 (`wrangler` unauthenticated; `CLOUDFLARE_API_TOKEN`
unset, 2026-08-13). A Node/VM `discoverCompetitions` 200 is **not** a
substitute. No isolate HTTP status was observed — neither 200 nor a
standing 403.

`wrangler.jsonc` has **no** `schedules`. Cron stays off until someone
deploys this branch, triggers `playhq-import` (`npx wrangler workflows
trigger playhq-import`, or `/admin` Run import once secrets exist), and
records isolate HTTP status from Worker logs. Add
`schedules: ["30 22 * * SAT"]` on the Workflow binding only if that
status is 200. If the isolate returns a standing 403, stop; the tunnel
fallback in **Error handling** remains unimplemented.

## Out of scope

- Archive PDF ingestion.
- City Night / Super League / Juniors (still no org IDs).
- Rewriting git CSV from the Worker.
- Recomputing ladders from fixtures (PlayHQ ladder remains the fact table).
- Public “Sync now” button (admin “Run import” is in scope).
- Queues, Durable Object rate limiters, Browser Rendering.

## Success

- Sunday morning, current-season ladders and fixtures in D1 match PlayHQ
  without a laptop.
- `/admin` shows that run (or its failure) without `wrangler tail`.
- A failed grade does not leave D1 half-updated.
- Re-running the workflow is a no-diff upsert when PlayHQ is unchanged.
- `scripts/fetch-playhq.ts` / `import-csv.ts` still rebuild everything from
  git for local and disaster recovery.
- PLAN.md’s scrape etiquette (1 req/sec, identifying UA, cached raw) still
  holds.

## Implementation notes (for the later plan)

Refactor order, so the Worker is a new adapter not a fork:

1. `CaptureStore` + fs implementation; client tests green.
2. `runFetch` returns rows without requiring CSV; CLI writes CSV.
3. `createD1Executor`; import tests green.
4. R2 store + Workflow + wrapper entry + `import_runs` migration (insert
   `running` on lock).
5. `/admin` login + runs table + Run import, against the sqlite harness.
6. Worker-isolate PlayHQ spike, then enable `schedules`.

Do not enable cron until the spike passes.
