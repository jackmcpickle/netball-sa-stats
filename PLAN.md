# Netball SA competition results — design

## Goal

Standalone **Cloudflare Workers** app that stores end-of-regular-season ladder placements (and available team stats) for every team in:

- Adelaide Metropolitan Netball Division (AMND) — winter
- City Night Division (CND) — summer (spans years, e.g. 2025/26)
- Netball SA Premier League
- Premier League Reserves

Primary use: average finish / comparison graphs for Matrics vs other clubs.

**Phase 1:** Workers app + **Cloudflare D1** + **Drizzle ORM** schema/migrations + sync that upserts into D1 + CSV export for backup/analysis. Graph UI can follow in the same app later.

This is **not** part of the existing Astro/Turso matrics-website DB. Own Worker, own D1 database, own Drizzle schema.

## Architecture

```
┌─────────────────────┐     scrape/backfill      ┌──────────────────┐
│ sync (CLI / cron /  │ ───────────────────────► │ Cloudflare D1    │
│ admin trigger)      │     Drizzle upserts      │ (results DB)     │
└─────────────────────┘                          └────────┬─────────┘
                                                          │
┌─────────────────────┐     HTTP JSON / CSV export        │
│ Workers API (+ later│ ◄─────────────────────────────────┘
│ graph UI)           │
└─────────────────────┘
```

- **Runtime:** Cloudflare Workers (`wrangler`)
- **DB:** Cloudflare D1 (SQLite)
- **ORM:** Drizzle (`drizzle-orm/d1` + `drizzle-kit` with `dialect: 'sqlite'` / D1 driver)
- **App location:** new package `apps/competition-results/` in this monorepo (own `package.json`, `wrangler.toml`, `src/`, `drizzle/`)
- **CSV:** optional export from D1 and/or scrape staging under `apps/competition-results/data/` — D1 is source of truth

## Scope

**In**

- Every club and team in each competition/grade/season discoverable from public sources
- End-of-regular-season **ladder position** (required)
- Team ladder stats when available: played, won, drawn, lost, byes, goals for/against, goal difference, points, percentage / shooting stats
- Winter and summer seasons (summer spans years, e.g. `Summer 2025/26`)
- Idempotent sync into D1 for past + current + future published seasons
- Archive/backfill rows when PlayHQ lacks history
- Minimal Workers API: health, list seasons, list results (filter by competition/season/club), CSV export

**Out (phase 1)**

- Finals results / premiership flags (ladder only)
- Player-level stats
- Polished public graph UI (schema/API ready for it)
- Coupling to matrics-website Turso DB

## Sources

1. **PlayHQ** (primary) — public ladders and team stats for AMND, CND, Premier League, Reserves
2. **Wayback Final Premiership Placings PDFs** — AMND 2000–2014, 2016; `source=archive_pdf`
3. **Other archives** — SportzVault / news as available; nulls allowed except `ladder_position`

## Data model (D1 / Drizzle)

SQLite-compatible Drizzle tables in `apps/competition-results/src/db/schema.ts`. Migrations via `drizzle-kit` → applied with `wrangler d1 migrations apply`.

### `competitions`

| Column        | Type                     | Notes                                                                      |
| ------------- | ------------------------ | -------------------------------------------------------------------------- |
| id            | integer PK autoincrement |                                                                            |
| key           | text unique              | `amnd`, `city_night_division`, `premier_league`, `premier_league_reserves` |
| name          | text                     | Display name                                                               |
| playhq_org_id | text nullable            | PlayHQ org id when known                                                   |

### `seasons`

| Column             | Type                      | Notes                                                                                |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------ |
| id                 | integer PK                |                                                                                      |
| competition_id     | integer FK → competitions |                                                                                      |
| season_key         | text unique               | e.g. `amnd-winter-2025`, `city_night_division-summer-2025-26`, `premier_league-2025` |
| competition_period | text                      | `winter` \| `summer` \| `annual` (PL typically annual/winter)                        |
| label              | text                      | e.g. `Winter 2025`, `Summer 2025/26`                                                 |
| start_year         | integer                   |                                                                                      |
| end_year           | integer                   | Same as start for winter/annual; +1 for summer                                       |
| playhq_id          | text nullable             |                                                                                      |
| source             | text                      | `playhq` \| `archive_pdf` \| `archive`                                               |

Unique logical key: `(competition_id, competition_period, start_year)`.

### `clubs`

| Column    | Type          | Notes                      |
| --------- | ------------- | -------------------------- |
| id        | integer PK    |                            |
| club_key  | text unique   | slug, e.g. `matrics`       |
| name      | text          |                            |
| playhq_id | text nullable | Shared across competitions |

### `grades`

| Column    | Type                 | Notes                                  |
| --------- | -------------------- | -------------------------------------- |
| id        | integer PK           |                                        |
| season_id | integer FK → seasons |                                        |
| grade_key | text unique          | e.g. `amnd-winter-2025-league`         |
| name      | text                 | League, A1, Inter 3, …                 |
| age_band  | text nullable        | Senior / Inter / Junior / … when known |
| playhq_id | text nullable        |                                        |

### `teams`

| Column       | Type               | Notes                          |
| ------------ | ------------------ | ------------------------------ |
| id           | integer PK         |                                |
| club_id      | integer FK → clubs |                                |
| team_key     | text unique        | e.g. `matrics-1`               |
| display_name | text               | As shown on ladder (Matrics 1) |
| playhq_id    | text nullable      |                                |

### `team_season_results`

Core fact table. One row per team per grade per season.

| Column          | Type                 | Notes                                                   |
| --------------- | -------------------- | ------------------------------------------------------- |
| id              | integer PK           |                                                         |
| team_id         | integer FK → teams   |                                                         |
| grade_id        | integer FK → grades  |                                                         |
| ladder_position | integer **required** | End of regular season                                   |
| played          | integer nullable     |                                                         |
| won             | integer nullable     |                                                         |
| drawn           | integer nullable     |                                                         |
| lost            | integer nullable     |                                                         |
| byes            | integer nullable     |                                                         |
| goals_for       | integer nullable     |                                                         |
| goals_against   | integer nullable     |                                                         |
| goal_difference | integer nullable     |                                                         |
| points          | integer nullable     | Ladder points                                           |
| percentage      | real nullable        | If shown (goal %)                                       |
| shots_attempted | integer nullable     | If exposed                                              |
| shots_scored    | integer nullable     | If exposed                                              |
| is_final        | integer              | 0/1; false while season in progress                     |
| source          | text                 | `playhq` \| `archive_pdf` \| `archive`                  |
| placement_basis | text                 | `regular_season_ladder` \| `final_premiership_placings` |
| notes           | text nullable        |                                                         |
| scraped_at      | integer nullable     | unix ms                                                 |

Unique: `(team_id, grade_id)`.

## CSV layout (export / staging)

Directory: `apps/competition-results/data/`

| File                      | Role                                      |
| ------------------------- | ----------------------------------------- |
| `competitions.csv`        | Competition catalogue                     |
| `seasons.csv`             | All seasons (AMND winter, CND summer, PL) |
| `clubs.csv`               | Shared club list                          |
| `grades.csv`              | Grades per season                         |
| `teams.csv`               | Teams per club                            |
| `team_season_results.csv` | Placements + stats                        |

Keys use stable string keys (`season_key`, `club_key`, …). Sync **writes D1 first**; CSV export is derived (and optional staging during scrape).

## Sync

**`apps/competition-results/scripts/sync-competition-results.ts`** (+ `pnpm competition:sync` in that package)

Also expose:

- **Admin/cron path on the Worker** (e.g. scheduled trigger or secret-protected `POST /sync`) for re-running `--latest` after deploy
- Local CLI for heavy Playwright/browser scrapes (PlayHQ often blocks datacenter IPs)

| Flag                                                                                    | Behaviour                                             |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| (default)                                                                               | Discover and sync all known competitions/seasons → D1 |
| `--competition amnd\|city_night_division\|premier_league\|premier_league_reserves\|all` | Filter                                                |
| `--season <season_key>`                                                                 | One season                                            |
| `--latest`                                                                              | Newest published season per selected competition      |
| `--backfill`                                                                            | Archive PDF / SportzVault paths                       |
| `--export-csv`                                                                          | Write `data/*.csv` from D1 after sync                 |

Behaviour:

1. Discover seasons on PlayHQ (past, current, future once listed)
2. For each season: grades → ladder → team rows
3. Upsert D1 by stable keys / playhq ids (idempotent)
4. Incomplete seasons: `is_final=0`; re-run sets `is_final=1`
5. Never invent stats; null when unavailable
6. Prefer PlayHQ `regular_season_ladder` over archive PDF when both exist for the same team/grade/season

PlayHQ CloudFront may 403 datacenter IPs — browser automation from an unblocked network for live scrape; Wayback for historical where needed.

## Workers API (phase 1)

| Route                               | Purpose                                             |
| ----------------------------------- | --------------------------------------------------- |
| `GET /health`                       | Liveness                                            |
| `GET /competitions`                 | List competitions                                   |
| `GET /seasons?competition=`         | List seasons                                        |
| `GET /results?season=&club=&grade=` | Ladder rows (+ joins)                               |
| `GET /export.csv?...`               | CSV download of results                             |
| `POST /sync` (secret)               | Trigger `--latest` style sync if runnable on Worker |

Auth: sync/admin routes protected by shared secret header; public read OK for club-internal use (tighten later if needed).

## Implementation phases

1. **Scaffold Workers app** — `apps/competition-results` with wrangler, D1 binding, Drizzle config
2. **Schema + migrations** — tables above; apply to local + remote D1
3. **Seed competitions** — AMND, CND, PL, Reserves rows
4. **Sync script** — PlayHQ discovery + ladder scrape → D1 upsert
5. **Archive backfill** — Wayback Final Premiership Placings PDFs (2000–2014, 2016)
6. **Workers API** — health + query + CSV export
7. _(Later)_ Graph / comparison UI on the same Worker (or Assets)

## Success criteria

- App deploys to Cloudflare Workers with its own D1 database
- Drizzle schema/migrations manage all tables
- Sync upserts into D1 idempotently; re-runnable for next seasons
- Every stored team has `ladder_position`
- CSV export works from D1
- Matrics and rival clubs present for available seasons

## Research findings (2026-08-08)

### PlayHQ org / season IDs

| Competition               | Org                                    | Org ID     |
| ------------------------- | -------------------------------------- | ---------- |
| AMND                      | Adelaide Metropolitan Netball Division | `7a5f35e1` |
| Premier League + Reserves | Netball South Australia                | `6fefc037` |

**AMND seasons (confirmed public URLs)**

| Season      | season_key         | PlayHQ season ID / slug                                     |
| ----------- | ------------------ | ----------------------------------------------------------- |
| Winter 2022 | `amnd-winter-2022` | `1e073dea` (`winter-2022` / `amnd-2022-winter-2022`)        |
| Winter 2024 | `amnd-winter-2024` | `4f37cb95` (`amnd-competition-winter-2024`)                 |
| Winter 2025 | `amnd-winter-2025` | `f6dd6ad2` (`amnd-competition-winter-2025`)                 |
| Winter 2026 | `amnd-winter-2026` | slug `amnd-competition-winter-2026` (grade AMND `4aebe074`) |

Winter 2023: not yet found in public indexes/Wayback; discover via org page when scraping from an unblocked IP.

**Premier League seasons** (League + Reserves are grades under one competition)

| Season | PlayHQ season ID | Premier grade | Reserves grade |
| ------ | ---------------- | ------------- | -------------- |
| 2022   | `d4d09c75`       | TBD scrape    | TBD scrape     |
| 2023   | `fdb84e54`       | TBD scrape    | TBD scrape     |
| 2024   | `6b351c9a`       | `6ab303e4`    | `9bc4481a`     |
| 2025   | `3b0a635f`       | `9a8085ed`    | `6073b8c7`     |
| 2026   | `b6ba0f43`       | TBD scrape    | TBD scrape     |

Grade names on PlayHQ: `Premier Division`, `Reserves Division`.

### How far ladders go

| Source                                        | Coverage                                                 | What we get                                                              |
| --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| PlayHQ live                                   | AMND ~2022–2026 (winter); PL ~2022–2026                  | Full ladders + team stats when public                                    |
| Wayback PlayHQ                                | Sparse (e.g. AMND 2024 season grades list; PL 2024/2025) | Fallback if live blocked                                                 |
| Legacy SportzVault (`amnd.sa.netball.com.au`) | Season selector ~2011–2020 on archived ladder UI         | Interactive ladders (harder scrape)                                      |
| Final Premiership Placings PDFs (Wayback)     | **2000–2014, 2016** (all grades, ranked 1…n)             | Placement only; stats null. **Not found** for 2015, 2017–2021 in Wayback |
| Club/news archives                            | Partial PL narratives (minor premiers / GF)              | Spot-check only; not full ladders                                        |

**Important:** Archive PDFs are titled “Final Premiership Placings”. They list every team in each grade (not only finalists). Top-4 order may reflect finals outcomes rather than pure minor-round ladder. Store as `source=archive_pdf` with `placement_basis=final_premiership_placings` and prefer PlayHQ minor-round ladder when both exist.

### Summer seasons

AMND on PlayHQ/Netball SA is **winter-only** (Apr–Sep). Stadium summer competition is **City Night Division (CND)**, a separate org — not an AMND summer season. No CND PlayHQ org ID confirmed yet from indexes.

### Scrape constraints

PlayHQ returns **CloudFront 403** from this cloud agent IP for live pages. Sync script must use real browser automation and may need to run from a non-blocked network (or local machine). Wayback works for some historical season/grade lists.

### Club archives

None provided by Matrics for this project. Backfill = public Wayback PDFs + SportzVault + PlayHQ only.

## Resolved

- **CND included** as the summer competition (`city_night_division`).
- **Archive PDFs imported** for 2000–2014, 2016 as placements with `source=archive_pdf` and `placement_basis=final_premiership_placings` (top 4 may reflect finals). Prefer PlayHQ minor-round ladder when both exist.
- **Platform:** own Cloudflare Workers app + D1 + Drizzle (not Turso / not inside matrics-website schema).
- **Monorepo path:** `apps/competition-results/`.

## Unresolved questions

- None blocking implementation. CND PlayHQ org ID to be discovered during sync scrape.
- Separate Cloudflare account/zone vs same as matrics-website? (default: same account, separate Worker + D1)
