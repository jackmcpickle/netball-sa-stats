# Netball Open Data — design

## Goal

Public site ranking South Australian netball clubs by ladder finishes across every grade and season.

Headline number: a **club championship score** per season — ladder position converted to points, weighted by grade standard, summed across every grade a club fields. Plus per-season ladders, club profiles, and rank movement across the PlayHQ era (2022–2026).

Primary question: which club is really SA's strongest — including depth, not just a strong top team.

## Repo

This repo **is** the app. No monorepo, no separate package.

- **Runtime:** Cloudflare Workers via TanStack Start (`main: src/worker.ts`)
- **DB:** Cloudflare D1, binding `DB`, database `netball-stats` (`901da6ea-c57d-4529-915e-2d1718186efa`)
- **ORM:** Drizzle (`drizzle-orm/d1`), migrations in `drizzle/`, applied with `wrangler d1 migrations apply`
- **Tooling:** Vite+ (`vp`), pnpm, Vitest (`vp test`)
- **UI:** React 19, Tailwind v4, Base UI, hand-rolled SVG charts

### Existing scaffold is removed

`src/db/schema.ts` currently holds demo `teams` / `players` tables from the starter, shipped in `drizzle/0000_cuddly_fallen_one.sql`. That migration was **never applied remotely** (remote D1 has no tables), so it is deleted and regenerated rather than migrated.

### Code layout

Pipeline code lives under `src/` — `vite.config.ts` globs tests at `src/**/*.test.{ts,tsx}` only, and the Worker reuses the scoring and validation logic.

```
src/
  db/           schema, migrations helpers, queries
  pipeline/
    fetch/      PlayHQ scrapers → in-memory rows
    import/     rows → D1, invariants
    scoring/    championship score, shared with Worker
  routes/       TanStack Start routes
  components/
scripts/        thin CLI entrypoints only
data/
  clubs.csv, club_aliases.csv   curated club identity
  competitions.csv, grade_weights.csv   catalogue seeds
  archive/      PDF-era staging (separate pipeline)
testdata/
  playhq/       small committed PlayHQ probe fixtures
  e2e/          AMND/PL snapshot for CI (not live truth)
```

## Architecture

Two stages, still decoupled — but D1 is the store, not git.

```
┌──────────────┐  fetch (CLI or Worker)      ┌──────────────┐
│ PlayHQ       │ ──────────────────────────► │ D1           │
│              │   rate-limited              │ (truth)      │
│              │   raw cache: local / R2     └──────┬───────┘
└──────────────┘                                    │ server functions
                                             ┌──────▼───────┐
                                             │ Web UI       │
                                             └──────────────┘
```

**Stage 1 — `fetch`.** PlayHQ → validated upserts into local or remote D1. Network-dependent. CLI: `pnpm exec tsx scripts/fetch-playhq.ts` (`--remote` for production). Worker: `PlayHqImportWorkflow` / `/admin`. Raw JSON goes to a gitignored `data/raw/` cache (CLI) or R2 (Worker).

**Stage 2 — `import` invariants.** Same `runImportData` path as the leftover CSV importer. Ladder positions, club aliases, played/won/lost, grade-weight coverage (championship comps only).

**Git keeps code and curation**, not scraped ladders:

- `data/clubs.csv`, `data/club_aliases.csv` — human-reviewed club identity. Fetch may append newly minted clubs so they can be reviewed.
- `data/competitions.csv`, `data/grade_weights.csv` — catalogue seeds from `generate-seed.ts`. `has_data` is a seed hint; live coverage is D1 season rows.
- `testdata/playhq/` — small probe fixtures for parser tests.
- `testdata/e2e/` — frozen AMND/PL snapshot so CI can build a local D1. Not the scrape write path.
- Generated `data/seasons.csv`, `grades.csv`, `teams.csv`, `team_season_results.csv`, `games-*.csv`, and live `data/raw/*.json` are gitignored.

**Why D1, not committed CSV:** a metro-association fetch is hundreds of raw files and tens of thousands of result rows. Reviewing that as a PR is noise. Recoverability is the local cache, R2, and PlayHQ itself. Re-running fetch on an unchanged season upserts the same keys.

**`is_final`** is curated in D1 (`seasons.is_final`), not inferred from PlayHQ status. Collect reads the existing map and will not flip a season to final.

**Live ACTIVE seasons** sync via `PlayHqImportWorkflow` (manual `/admin` once secrets exist). Weekly cron is **not** enabled until a Worker-isolate probe of `api.playhq.com` returns 200. Cron hits PlayHQ → D1; it does not commit. See [docs/superpowers/specs/2026-08-13-playhq-automated-import-design.md](./docs/superpowers/specs/2026-08-13-playhq-automated-import-design.md).

## Scope

**In**

- Every club and team discoverable in each competition/grade/season
- End-of-regular-season **ladder position** (required) + team ladder stats when available
- Club championship score, rank movement, club profiles, per-season ladders
- Idempotent import; re-runnable for future seasons

**Out (phase 1)**

- **Match-level results** — additive later, see below
- **Head-to-head / Results tab** — depends on matches
- Player-level stats
- Finals results / premiership flags beyond ladder position 1

### Matches: why ladders are primary

The design mock says "ladders are computed from match results, not entered directly". Not worth doing: PlayHQ publishes the official ladder directly, and recomputing it means exactly reproducing Netball SA's tiebreak rules or publishing numbers that disagree with the official record.

So ladders are scraped as the fact table. A `matches` table drops in later without reshaping `team_season_results`, unlocking head-to-head and the Results tab. The design mock's "2001—2025" headline is wrong for this build — the site covers 2022–2026 and should say so.

## Competitions

| Competition                            | Key                       | Phase 1 data                       | Org ID     |
| -------------------------------------- | ------------------------- | ---------------------------------- | ---------- |
| Adelaide Metropolitan Netball Division | `amnd`                    | Yes                                | `7a5f35e1` |
| Netball SA Premier League              | `premier_league`          | Yes                                | `6fefc037` |
| Premier League Reserves                | `premier_league_reserves` | Yes                                | `6fefc037` |
| City Night Division                    | `city_night_division`     | Fetch into D1; not championship    | `2276ec85` |
| Super League                           | `super_league`            | No. Unresearched                   | —          |
| Juniors                                | `juniors`                 | No                                 | —          |
| SAUCNA                                 | `saucna`                  | Fetch into D1; not championship    | `fb89f1f1` |
| Southern United (SUNA)                 | `suna`                    | Fetch into D1; not championship    | `4bd9b8ae` |
| Elizabeth Netball Association          | `elizabeth`               | Fetch into D1; not championship    | `7ffb0e67` |
| SAMMNA                                 | `sammna`                  | Fetch into D1; not championship    | `7936878d` |
| SA Districts (SADNA)                   | `sadna`                   | No. Name only, PlayHQ org unknown  | —          |

The first three carry ladder data and championship weights. Metro associations have verified PlayHQ org IDs (checked 2026-08-22 via `discoverCompetitions`). `COLLECT_JOBS` in `collect.ts` walks those orgs the same way as AMND. New association jobs start at 2023. `--org` / `--competition` still targets one. `0001_seed.sql` is already applied, so the new rows land in `drizzle/0009_sa_associations.sql`.

They are not in the club championship. No `grade_weights` rows, and `fetchChampionshipHistory` only scores keys that already have bands. Importing a SUNA ladder later must not change Contax's AMND rank. AMND/PL stay 2022+.

Each association org also lists carnivals, schools or summer on PlayHQ. Those names stay out until they get their own catalogue keys:

- SAUCNA → `SAUCNA Winter`
- SUNA → `SUNA Winter` (first winter season is 2026)
- Elizabeth → `Elizabeth Netball Association`, winter seasons only (summer shares the same competition object)
- City Night → `City Night Division 1`, summer 2023+ (the 2021 winter object is out of range)
- SAMMNA → `M League`, winter only (not Super League)

SADNA is name only. Do not invent an org id, and do not use WA `489c7576`. Country associations (Hills, Mid Hills, SHNA, GSNA, Barossa, Gawler, and the rest) can be added later the same way.

Indexed PlayHQ slugs that match the live metro orgs: Elizabeth `elizabeth-netball-association`, SAMMNA `south-australian-mens-and-mixed-netball-association` (https://sammna.com.au/), City Night `city-night-division`. City Night's public index only had 2021. GraphQL has summer 2023+. SAUCNA indexed winters include 2022 `f60d7b32`, 2024 `f6a979ff`; winter 2023 and 2026 were missing from the public index and come from GraphQL. SUNA's public index only had the 2024 junior carnival; league winter is `SUNA Winter`. Do not invent missing season ids.

## Sources & coverage

**PlayHQ only. 2022–2026, five seasons.**

| Source | Seasons                                                                           | Gives                                 |
| ------ | --------------------------------------------------------------------------------- | ------------------------------------- |
| PlayHQ | AMND 2022–2026, PL 2022–2026. Metro associations fetch into D1 from 2023. | Full ladders + team stats |

Premier League has **no 2022 season** — it did not run, due to COVID. That is a real-world absence, not missing data, and the UI should say so rather than render a gap. AMND ran 2022 normally.

One source, one measurement, one era. Every season has the same columns available — true regular-season ladders with played/won/lost, goals for and against, and percentage. No methodology change, no gaps, no null-heavy rows.

Pre-2022 data exists but is a different kind of dataset — placement-only, partly finals-contaminated, with six seasons missing outright. It is deliberately excluded and planned separately in [ARCHIVE-PLAN.md](./ARCHIVE-PLAN.md).

The schema still carries `source`, `placement_basis`, `position_uncertain` and nullable stat columns so the archive can land later without a migration. They cost nothing now and are expensive to add once the table has rows. In this build every row is `source = 'playhq'`, `placement_basis = 'regular_season_ladder'`, `position_uncertain = 0`.

### Scrape etiquette

Re-publishing rather than personal archiving, so: **1 request/second**, descriptive User-Agent with a contact. Responses cache to gitignored `data/raw/` (CLI) or R2 (Worker) so re-runs need not re-hit the source. Do not commit live captures.

PlayHQ HTML org pages still 403 datacenter IPs. GraphQL with the identifying User-Agent and required `Origin` / `tenant` headers is the fetch path (`src/pipeline/fetch/playhq-client.ts`). Weekly cron stays off until a Worker-isolate probe of `api.playhq.com` returns 200.

## Data model

### `competitions`

| Column        | Type          | Notes                       |
| ------------- | ------------- | --------------------------- |
| id            | integer PK    |                             |
| key           | text unique   | `amnd`, `premier_league`, … |
| name          | text          | Display name                |
| playhq_org_id | text nullable |                             |

### `seasons`

| Column             | Type          | Notes                                             |
| ------------------ | ------------- | ------------------------------------------------- |
| id                 | integer PK    |                                                   |
| competition_id     | integer FK    |                                                   |
| season_key         | text unique   | `amnd-winter-2025`                                |
| competition_period | text          | `winter` \| `summer` \| `annual`                  |
| label              | text          | `Winter 2025`, `Summer 2025/26`                   |
| start_year         | integer       |                                                   |
| end_year           | integer       | Same as start for winter/annual; +1 for summer    |
| is_final           | integer       | **Human-curated in D1**, not inferred |
| playhq_id          | text nullable |                                                   |
| source             | text          | `playhq` (archive values reserved)                |

Unique logical key: `(competition_id, competition_period, start_year)`.

`is_final` is curated because a scraper cannot reliably distinguish a round-18 ladder from a round-22 one. Flip it in D1 (or a future admin control), not by inferring PlayHQ `COMPLETED`.

### `clubs`

| Column           | Type             | Notes                |
| ---------------- | ---------------- | -------------------- |
| id               | integer PK       |                      |
| club_key         | text unique      | slug, e.g. `matrics` |
| name             | text             |                      |
| established_year | integer nullable | Club profile         |
| home_venue       | text nullable    | Club profile         |
| playhq_id        | text nullable    |                      |

### `club_aliases`

| Column     | Type               | Notes                        |
| ---------- | ------------------ | ---------------------------- |
| id         | integer PK         |                              |
| club_id    | integer FK → clubs |                              |
| alias_text | text unique        | Normalised source spelling   |
| source     | text               | Where the spelling came from |

Real examples already observed across sources: `C/Coasters` → `City Coasters`, `West/Jets` → `Western Jets`, `N/Jags` → `Newton Jaguars`, `Pembroke` → `Pembroke O.S.`, `Cheerio` vs `Cheerio Phoenix`, `Oakdale Phoenix`, `Sacred Heart O.C.`, `Westminster O.S.`, `Seymour O.C.`, `MOSA`.

26 years and three sources means `Matrics`, `Matrics NC`, `MATRICS`, plus real mergers, renames and folds. Without aliasing, every variant becomes a new club and a club's trend line fragments into half-lines.

**Unknown club names fail the import loudly.** No auto-creation. The first backfill run stops repeatedly and a mapping gets curated by hand — deliberately, because once a bad run has written 400 rows against `matrics-nc`, untangling it is manual archaeology. With one source and five seasons, the initial alias set is small.

### `grades`

| Column     | Type                 | Notes                                        |
| ---------- | -------------------- | -------------------------------------------- |
| id         | integer PK           |                                              |
| season_id  | integer FK → seasons |                                              |
| grade_key  | text unique          | `amnd-winter-2025-league`                    |
| name       | text                 | League, A1, Inter 3, …                       |
| tier       | integer              | Seniority band, ordered — 1 = Premier/League |
| division   | integer nullable     | Rank within band, parsed from name (A1→1)    |
| team_count | integer              | Rows on the ladder                           |
| age_band   | text nullable        | Senior / Inter / Junior                      |
| playhq_id  | text nullable        |                                              |

`tier` and `division` exist because finishing 1st in Division 8 and 1st in League are the same integer and wildly different achievements. Without them, "average finish" rewards clubs that field many weak teams.

`team_count` is free at scrape time and **impossible to recover later without re-scraping**. Position 4 of 6 is not position 4 of 14.

### `teams`

Season-scoped. There is no global `team_key` — squad numbers get reassigned between seasons, and "Matrics 1" in AMND League and in Premier League are different squads.

| Column       | Type                | Notes                  |
| ------------ | ------------------- | ---------------------- |
| id           | integer PK          |                        |
| club_id      | integer FK → clubs  |                        |
| grade_id     | integer FK → grades |                        |
| display_name | text                | As shown on the ladder |
| squad_number | integer nullable    | Parsed from name       |
| playhq_id    | text nullable       |                        |

**Clubs field multiple teams in the same grade** — the archived regrading PDFs show `Walkerville (1)` / `Walkerville (2)`, `Pembroke O.S. (1)` / `(2)`, `Contax (1)` / `(2)`. The same holds on PlayHQ, so `squad_number` is required and nothing may assume one row per club per grade.

### `team_season_results`

Core fact table. One row per team per grade per season.

| Column                                    | Type                 | Notes                                                   |
| ----------------------------------------- | -------------------- | ------------------------------------------------------- |
| id                                        | integer PK           |                                                         |
| team_id                                   | integer FK → teams   |                                                         |
| grade_id                                  | integer FK → grades  |                                                         |
| ladder_position                           | integer **required** |                                                         |
| position_uncertain                        | integer              | 0/1 — always 0 in this build; reserved for archive      |
| played, won, drawn, lost, byes            | integer nullable     |                                                         |
| goals_for, goals_against, goal_difference | integer nullable     |                                                         |
| points                                    | integer nullable     | Ladder points                                           |
| percentage                                | real nullable        | Goals for ÷ against × 100                               |
| shots_attempted, shots_scored             | integer nullable     | If exposed                                              |
| source                                    | text                 | `playhq` (archive values reserved)                      |
| placement_basis                           | text                 | `regular_season_ladder` \| `final_premiership_placings` |
| notes                                     | text nullable        |                                                         |
| scraped_at                                | integer nullable     | unix ms                                                 |

Unique: `(team_id, grade_id)`.

### `grade_weights`

| Column         | Type             | Notes |
| -------------- | ---------------- | ----- |
| id             | integer PK       |       |
| competition_id | integer FK       |       |
| tier           | integer          |       |
| division       | integer nullable |       |
| weight         | real             |       |

Seeded from CSV, editable per grade. Defaults generated by `weight = tier_base − (division − 1) × step` rather than 40 hand-typed numbers that drift:

| Tier | Band              | base | step  | Range        |
| ---- | ----------------- | ---- | ----- | ------------ |
| 1    | Premier Division  | 1.00 | —     | 1.00         |
| 2    | Reserves Division | 0.80 | —     | 0.80         |
| 3    | AMND League       | 0.75 | —     | 0.75         |
| 4    | A. Grade          | 0.68 | —     | 0.68         |
| 5    | B.1–B.6           | 0.62 | 0.03  | 0.62 → 0.47  |
| 6    | Inter. 1–6        | 0.45 | 0.015 | 0.45 → 0.375 |
| 7    | C.1–C.6           | 0.36 | 0.02  | 0.36 → 0.26  |
| 8    | Junior 1–8        | 0.38 | 0.015 | 0.38 → 0.28  |
| 9    | Sub-Junior 1–8    | 0.32 | 0.015 | 0.32 → 0.22  |
| 10   | Primary 1–6       | 0.26 | 0.015 | 0.26 → 0.19  |
| 11   | Sub-Primary 1–2   | 0.20 | 0.015 | 0.20 → 0.19  |

Full AMND taxonomy confirmed from the archived 2016 ladder page: AMND League, A. Grade, B.1–B.6, C.1–C.4 and C.6, Inter. 1–5, Junior 1–8, Sub-Junior 1–8, Primary 1–6, Sub-Primary 1–2.

Notes on the contentious ones:

- **PL Reserves (0.80) above AMND League (0.75)** — a Premier club's second string outranks the best metro club. Deliberate.
- **C below Inter.** C is a normal competitive band, not a separate stream: the archived "Senior and Intermediate Regrading" PDF shows two-way promotion/relegation between B.5 and C.1, so C sits in the same ladder as B, just lower.
- Junior tiers only matter once juniors carry data.

## Championship score

```
score(club, season) = Σ over grades fielded:
    (team_count − ladder_position + 1) × grade_weight(grade)
```

**Computed at query time.** Nothing derived is stored. Change a weight, refresh, every season re-ranks instantly — which is exactly what calibration needs, since this is the number people will argue about. The dataset is a few thousand rows; precomputation buys nothing.

Rank movement vs previous season and best-ever finish are likewise query-time, via window functions over seasons.

**In-progress seasons are excluded from rankings.** A half-finished 2026 ladder is not comparable to a complete 2025 one, but would otherwise appear as the newest point on every trend line and as "current rank" on every profile. In-progress seasons still appear in the Ladders tab, labelled. Trend lines end at the last `is_final` season.

**Known bias, accepted for now:** the raw formula means a team in a 14-team grade can outscore a grade winner in an 8-team grade, and depth is rewarded on top. A size-normalised variant (position as a 0–1 fraction × weight) is a one-line change if the real numbers look wrong.

## Validation

Two kinds of failure, two kinds of test.

**Import invariants** catch _the world changing_ — abort rather than write partial data:

- Ladder positions within a grade are exactly `1..n`, no gaps, no duplicates
- `team_count` equals the row count
- `played = won + drawn + lost` where all present
- Goals non-negative
- Every club name resolves via `club_aliases`
- A grade that previously had N teams and now has far fewer → warning

**Parser fixture tests** catch _breaking your own code_ — run against the small committed set in `testdata/playhq/`, not a live scrape dump.

Invariants will occasionally fire on legitimately odd data — a mid-season withdrawal, a shared position. Those get hand-curated exceptions. That friction is correct for a dataset whose selling point is "free to check".

## Public posture

Public site, public CSV export and JSON API, per-row provenance surfaced in the UI and exports, and a method page.

A visible line stating the data is **unofficial, compiled from public sources, with Netball SA and PlayHQ as the authoritative record**.

Provenance directly serves the "free to check" claim and is the best answer to anyone questioning a number.

## UI

Source design: `docs/design/Netball Open Data.dc.html` — 182 inline-styled divs to be componentised.

- **Tailwind v4** with `@theme` tokens up front — `bg-paper` (`#fffaf0`), `text-ink` (`#3a3a3a`), hairline `#e5e5e5`, Inter + IBM Plex Mono. Components reference tokens, never raw hexes.
- **Base UI** for selects, tabs, dropdowns — headless, matches the hand-tuned aesthetic.
- **Hand-rolled SVG charts, no chart dependency.** Rank-movement multi-line (inverted axis, lower-is-better) and championship-points bars. The data is small and static per render; SSR-friendly with zero hydration cost. The mock already contains hand-written SVG.

Sections: rankings table, club profile, ladders, method. Head-to-head and Results are gated on the later `matches` phase and shown as 2022+ only.

## Phases

1. **Schema** — tables above, one clean migration, seed competitions + grade weights
2. **Import** — fetch PlayHQ → D1, with invariants and fixture tests
3. **Backend APIs** — server functions for the UI, plus public JSON + CSV export
4. **UI** — componentise `docs/design` with Tailwind + Base UI + SVG charts, sample data
5. **Wire up** — connect UI to real backend
6. _(Later)_ `matches` table → head-to-head + Results, 2022+
7. _(Later)_ City Night, Super League, juniors

## Success criteria

- A fetch of SAUCNA (or any catalogued org) does not create a git-tracked CSV or `data/raw/` file; D1 gets the rows
- Rebuild a local site: migrate + `import-csv --dir testdata/e2e` (CI snapshot) or `fetch-playhq` against PlayHQ
- Every stored team has `ladder_position`; every grade has `team_count`
- Championship rankings render for AMND + PL across available seasons
- Coverage stated from D1 rows; catalogue `has_data` is not the live flag
- Re-running fetch on an unchanged season upserts the same keys

## Unresolved

- **AMND Winter 2023** — no public URL found; discover during scrape or accept as a gap
- **PL grade IDs for 2022, 2023, 2026** — TBD at scrape
- **Juniors in the championship score** — recommendation: include, weight low, offer a seniors-only toggle. Not urgent, no junior data in phase 1
- **Size-normalised scoring** — deferred until real numbers exist
- **Domain / hosting name**

## Reference: confirmed PlayHQ IDs

**AMND seasons**

| Season      | season_key         | PlayHQ ID / slug                                      |
| ----------- | ------------------ | ----------------------------------------------------- |
| Winter 2022 | `amnd-winter-2022` | `1e073dea` (`amnd-2022-winter-2022`)                  |
| Winter 2024 | `amnd-winter-2024` | `4f37cb95` (`amnd-competition-winter-2024`)           |
| Winter 2025 | `amnd-winter-2025` | `f6dd6ad2` (`amnd-competition-winter-2025`)           |
| Winter 2026 | `amnd-winter-2026` | slug `amnd-competition-winter-2026`, grade `4aebe074` |

**Premier League** — League and Reserves are grades under one competition. Grade names: `Premier Division`, `Reserves Division`.

| Season | Season ID  | Premier grade | Reserves grade |
| ------ | ---------- | ------------- | -------------- |
| 2022   | `d4d09c75` | TBD           | TBD            |
| 2023   | `fdb84e54` | TBD           | TBD            |
| 2024   | `6b351c9a` | `6ab303e4`    | `9bc4481a`     |
| 2025   | `3b0a635f` | `9a8085ed`    | `6073b8c7`     |
| 2026   | `b6ba0f43` | TBD           | TBD            |
