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
    fetch/      source scrapers → CSV
    import/     CSV → D1, invariants
    scoring/    championship score, shared with Worker
  routes/       TanStack Start routes
  components/
scripts/        thin CLI entrypoints only
data/
  raw/          per-season source captures (also test fixtures)
  *.csv         six normalised entity files — source of truth
```

## Architecture

Two stages, deliberately decoupled.

```
┌──────────────┐  fetch (local, networked)   ┌──────────────┐
│ PlayHQ       │ ──────────────────────────► │ data/*.csv   │
│              │   rate-limited, cached      │ (git, truth) │
│              │                             └──────┬───────┘
└──────────────┘                                    │ import (offline, pure)
                                                    ▼
                                             ┌──────────────┐
┌──────────────┐        server functions     │ Cloudflare   │
│ Web UI +     │ ◄────────────────────────── │ D1           │
│ CSV / JSON   │                             │ (projection) │
└──────────────┘                             └──────────────┘
```

**Stage 1 — `fetch`.** Sources → normalised CSVs in `data/`, committed. Network-dependent, slow, occasionally manual, runs locally on an unblocked IP.

**Stage 2 — `import`.** CSVs → D1 upserts. Pure, offline, fast, idempotent, runs against local or remote D1.

**Why:** a PlayHQ layout change breaks stage 1 only; captured data survives in git. The database rebuilds from a clean checkout with no network. Reviewing a scrape becomes reading a CSV diff — which is how you notice a scraper silently producing garbage.

**Consequence:** committed CSV is the real source of truth, D1 a queryable projection. CSVs must carry everything — `team_count`, `position_uncertain`, `source`, `placement_basis` — not just the display columns.

**Live ACTIVE seasons** can sync via `PlayHqImportWorkflow` (manual `/admin` Run import once secrets exist). Git CSV remains the archive for completed seasons. Weekly cron is **not** enabled until a Worker-isolate probe of `api.playhq.com` returns 200. See [docs/superpowers/specs/2026-08-13-playhq-automated-import-design.md](./docs/superpowers/specs/2026-08-13-playhq-automated-import-design.md).

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

| Competition                            | Key                       | Phase 1 data                        | Org ID     |
| -------------------------------------- | ------------------------- | ----------------------------------- | ---------- |
| Adelaide Metropolitan Netball Division | `amnd`                    | Yes                                 | `7a5f35e1` |
| Netball SA Premier League              | `premier_league`          | Yes                                 | `6fefc037` |
| Premier League Reserves                | `premier_league_reserves` | Yes                                 | `6fefc037` |
| City Night Division                    | `city_night_division`     | No — org filled, no imported rows   | `2276ec85` |
| Super League                           | `super_league`            | No — unresearched                   | —          |
| Juniors                                | `juniors`                 | No                                  | —          |
| SAUCNA                                 | `saucna`                  | No — org verified, no imported rows | `fb89f1f1` |
| Southern United (SUNA)                 | `suna`                    | No — org verified, no imported rows | `4bd9b8ae` |
| Elizabeth Netball Association          | `elizabeth`               | No — org verified, no imported rows | `7ffb0e67` |
| SAMMNA                                 | `sammna`                  | No — org verified, no imported rows | `7936878d` |
| SA Districts (SADNA)                   | `sadna`                   | No. Name only, PlayHQ org unknown   | —          |
| Hills Netball Association              | `hills`                   | No. Name only, PlayHQ org unknown   | —          |
| Mid Hills Netball Association          | `mid_hills`               | No. Org verified, no imported rows  | `7d13cb92` |
| Southern Hills (SHNA)                  | `shna`                    | No. Org verified, no imported rows  | `de681683` |
| Great Southern (GSNA)                  | `gsna`                    | No. Org verified, no imported rows  | `879ed891` |
| Barossa, Light and Gawler              | `barossa`                 | No. Org verified, no imported rows  | `d8505173` |
| Gawler and District                    | `gawler`                  | No. Org verified, no imported rows  | `10c20df0` |
| Port Pirie                             | `port_pirie`              | No. Org verified, no imported rows  | `75d217b0` |
| Whyalla                                | `whyalla`                 | No. Org verified, no imported rows  | `57c29823` |
| Eastern Eyre                           | `eastern_eyre`            | No. Org verified, no imported rows  | `57f440eb` |
| Port Lincoln                           | `port_lincoln`            | No. Org verified, no imported rows  | `3c28509a` |
| Riverland                              | `riverland`               | No. Org verified, no imported rows  | `1310360a` |
| River Murray                           | `river_murray`            | No. Org verified, no imported rows  | `33effa50` |
| Northern Areas                         | `northern_areas`          | No. Org verified, no imported rows  | `8dd4ad01` |

The first three carry ladder data and championship weights. Metro associations have verified PlayHQ org IDs (checked 2026-08-22 via `discoverCompetitions`). `COLLECT_JOBS` in `collect.ts` walks those orgs the same way as AMND; new association jobs start at 2023. `--org` / `--competition` still targets one. `0001_seed.sql` is already applied, so the new rows land in `drizzle/0009_sa_associations.sql`.

They are **not** in the club championship. No `grade_weights` rows, and `fetchChampionshipHistory` only scores keys that already have bands. Importing a SUNA ladder later must not change Contax's AMND rank. New association jobs start at 2023. AMND/PL stay 2022+.

Each association org also lists carnivals, schools or summer on PlayHQ. Those names are out of scope until they get their own catalogue keys:

- SAUCNA → `SAUCNA Winter`
- SUNA → `SUNA Winter` (first winter season is 2026)
- Elizabeth → `Elizabeth Netball Association`, winter seasons only (summer shares the same competition object)
- City Night → `City Night Division 1`, summer 2023+ (the 2021 winter object is out of range)
- SAMMNA → `M League`, winter only (not Super League)
- Mid Hills → `WINTER` only. Summer and carnival stay out.
- SHNA → `SHNA` winter only.
- GSNA → `Great Southern Netball Association` winter only. Jill May / 9&U carnivals stay out.
- Barossa → `BLGNA Winter`
- Gawler → `Winter Netball` (summer is a separate PlayHQ object)
- Port Pirie / Whyalla / Eastern Eyre / Riverland / River Murray / Northern Areas → the winter home-and-away object named for the association
- Port Lincoln → `Winter Season Netball`

SADNA, Hills, Masters, Kangaroo Island, Kadina, Yorke Peninsula, Port Augusta, Roxby Downs, Adelaide Plains, North Eastern, Murray Valley, KNT, Mid South East, Mount Gambier, Limestone Coast, Great Flinders, and Western Eyre are name-only. Do not use WA `489c7576` for SADNA. Do not use `e801d340` or NSW Hills District `cd26c84e` for Hills. Skip Netball SA Country `b0bbe786` and the Adelaide Plains / BLGNA *-rep orgs. Skip Broken Hill as NSW.

GSNA `879ed891` is live. Official site https://greatsouthernnetball.wixsite.com/gsna lists ten Fleurieu clubs: Encounter Bay, Goolwa, Langhorne Creek, McLaren Vale, Mount Compass, Myponga, Strathalbyn, Victor Harbor, Willunga, Yankalilla.

Hills is NSA country. The official site is https://www.hillsnetballassociation.com/. hills.netball.asn.au does not resolve. Matches are Saturday home/away in the Netball SA winter season only. The ten clubs are Aldgate, Bridgewater, Crafers, Heathfield, Ironbank/Cherry Gardens, Mylor, Piccadilly, Stirling Comets, Summertown, and Uraidla. Contacts on file: hnaro1@outlook.com, info@hillsnetballassociation.com. The HNA site does not mention PlayHQ.

Indexed PlayHQ HTML still treats Hills `e801d340` as unconfirmed, so the catalogue does not store it. Mid Hills `7d13cb92` (slug mid-hills-netball-association) and SHNA `de681683` (slug southern-hills-netball-association, winter 2024 `e6e7d817`) are live. `discoverCompetitions` also listed Mid Hills winter 2024-2026 and SHNA winter 2024-2026. Those season ids stay in the probe, not in CSV. Do not invent missing season ids. SAUCNA indexed winters include 2022 `f60d7b32`, 2024 `f6a979ff`; winter 2023 and 2026 were missing from the public index and come from GraphQL. SUNA's public index only had the 2024 junior carnival; league winter is `SUNA Winter`.

## Sources & coverage

**PlayHQ only. 2022–2026, five seasons.**

| Source | Seasons                                                                           | Gives                                 |
| ------ | --------------------------------------------------------------------------------- | ------------------------------------- |
| PlayHQ | AMND 2022–2026, PL 2022–2026. Association orgs verified, no imported ladders yet. | Full ladders + team stats for AMND/PL |

Premier League has **no 2022 season** — it did not run, due to COVID. That is a real-world absence, not missing data, and the UI should say so rather than render a gap. AMND ran 2022 normally.

One source, one measurement, one era. Every season has the same columns available — true regular-season ladders with played/won/lost, goals for and against, and percentage. No methodology change, no gaps, no null-heavy rows.

Pre-2022 data exists but is a different kind of dataset — placement-only, partly finals-contaminated, with six seasons missing outright. It is deliberately excluded and planned separately in [ARCHIVE-PLAN.md](./ARCHIVE-PLAN.md).

The schema still carries `source`, `placement_basis`, `position_uncertain` and nullable stat columns so the archive can land later without a migration. They cost nothing now and are expensive to add once the table has rows. In this build every row is `source = 'playhq'`, `placement_basis = 'regular_season_ladder'`, `position_uncertain = 0`.

### Scrape etiquette

Re-publishing rather than personal archiving, so: **1 request/second**, descriptive User-Agent with a contact, responses cached to `data/raw/` so re-runs never re-hit the source.

PlayHQ HTML org pages still 403 datacenter IPs. GraphQL with the identifying User-Agent and required `Origin` / `tenant` headers is the fetch path (`src/pipeline/fetch/playhq-client.ts`). CLI caches to `data/raw/`; the Worker stores live captures in R2. Weekly cron stays off until a Worker-isolate probe of `api.playhq.com` returns 200.

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
| is_final           | integer       | **Human-curated in the season CSV**, not inferred |
| playhq_id          | text nullable |                                                   |
| source             | text          | `playhq` (archive values reserved)                |

Unique logical key: `(competition_id, competition_period, start_year)`.

`is_final` is curated because a scraper cannot reliably distinguish a round-18 ladder from a round-22 one. Marking a season final is a one-character diff in a file you already edit a few times a year.

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

**Parser fixture tests** catch _breaking your own code_ — run against the `data/raw/` captures, which are already committed, so the fixtures are free.

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
2. **Import** — fetch PlayHQ → CSV → D1, with invariants and fixture tests
3. **Backend APIs** — server functions for the UI, plus public JSON + CSV export
4. **UI** — componentise `docs/design` with Tailwind + Base UI + SVG charts, sample data
5. **Wire up** — connect UI to real backend
6. _(Later)_ `matches` table → head-to-head + Results, 2022+
7. _(Later)_ City Night, Super League, juniors

## Success criteria

- Rebuilds from a clean checkout: `import` → D1 → working site, no network
- Every stored team has `ladder_position`; every grade has `team_count`
- Championship rankings render for AMND + PL across available seasons
- Coverage (2022–2026) stated plainly in the UI; no implied history the data lacks
- Re-running fetch on an unchanged season produces an empty CSV diff

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
