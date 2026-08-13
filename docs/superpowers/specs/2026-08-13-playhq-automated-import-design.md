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

| Original assumption | Today |
| --- | --- |
| “A Worker cannot run a browser.” | Fetch is GraphQL (`src/pipeline/fetch/playhq-client.ts`), not Playwright. |
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

**C.** Cron-triggered Workflow. Current season, ladders + games, every Sunday
morning Adelaide time. Raw captures in a new R2 bucket. Validated upserts
into the existing D1. Git CSV stays the human-reviewed archive; a dump
script can open a PR after notable runs. No Queues, no Browser Rendering, no
home tunnel unless the Worker-isolate spike fails.

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

- `wrangler workflows trigger` / authenticated `POST /internal/import` with
  `{ years, games }` for a completed-season freeze or a spot year.
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
successful attempt; Workflows then replays the *step result* (the R2 key) if
a later step fails. Last week’s R2 object is an audit copy, not a cache hit.
Do not thread CLI `--refresh` into the Worker.

Steps (deterministic names, R2 keys not payloads as step returns):

1. `lock` — if another instance is `running`, exit. Instance id
   `playhq-{yyyy-mm-dd}` from a timestamp taken **inside** this step.
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
9. `record` — insert `import_runs` (started_at, finished_at, params,
   counts, warning JSON). Workflow instance retention is 30 days on paid;
   this table is the durable log.

Do **not** `Promise.all` the PlayHQ steps. Serial is the product.

### 4. Bindings (`wrangler.jsonc`)

- Existing `DB`.
- New R2 bucket `netball-stats-playhq-raw`, binding `PLAYHQ_RAW`.
- Workflow binding `PLAYHQ_IMPORT`, class `PlayHqImportWorkflow`,
  `schedules: ["30 22 * * SAT"]`.
- Secret `IMPORT_TRIGGER_TOKEN` for the manual HTTP trigger only.

No KV. No Queue. No Browser Rendering.

Mcpickle’s account already has unrelated R2 buckets; this one is new and
scoped to this Worker.

### 5. Worker entry

`wrangler.jsonc` currently has `"main": "@tanstack/react-start/server-entry"`.
Workflows need the class exported from the same script. Wrap that entry
(thin `src/worker.ts`) so default `fetch` still comes from TanStack Start
and `PlayHqImportWorkflow` is a named export. Do not put fetch/import logic
in the wrapper.

Manual trigger: `POST /internal/import` on the Start `fetch` path, bearer
token, calls `env.PLAYHQ_IMPORT.create({ params })`. Unauthenticated
requests 404 (do not advertise the route).

### 6. `import_runs` table

Small, additive migration. Columns: `id`, `instance_id`, `started_at`,
`finished_at`, `status`, `years_json`, `games`, `seasons`, `grades`,
`teams`, `results`, `games_count`, `warnings_json`, `error_text`. The
public site does not read it in v1.

## Error handling

| Failure | Behaviour |
| --- | --- |
| Transient PlayHQ 403/502 | Step retry, exponential, up to 6. |
| Persistent PlayHQ failure on one grade | Fail the workflow after retries. Do not upsert a partial season. Re-run: Workflows replay successful steps (R2 keys already written) and only retries the failed grade’s network call. |
| Validation error | Fail before `upsert`. Previous D1 data remains. |
| D1 batch error | Retry the upsert step only (SQL is idempotent). |
| Overlapping cron | Step 1 no-ops. |
| New club / unresolved fixture team | Same as CLI: warn, skip invented teams, never invent. |

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
- Spike (manual, once): `wrangler deploy` of a throwaway fetch step, or
  `wrangler dev --remote`, one `discoverCompetitions` call. Record HTTP
  status in this spec’s follow-up note. Implementation does not proceed to
  cron-on-production without that.

## Out of scope

- Archive PDF ingestion.
- City Night / Super League / Juniors (still no org IDs).
- Rewriting git CSV from the Worker.
- Recomputing ladders from fixtures (PlayHQ ladder remains the fact table).
- Public “Sync now” button.
- Queues, Durable Object rate limiters, Browser Rendering.

## Success

- Sunday morning, current-season ladders and fixtures in D1 match PlayHQ
  without a laptop.
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
4. R2 store + Workflow + wrapper entry + `import_runs` migration.
5. Worker-isolate PlayHQ spike, then enable `schedules`.

Do not enable cron until the spike passes.
