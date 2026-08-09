# Head to head, plus present/past club filtering — design

Date: 2026-08-09

## Problem

`src/routes/head-to-head.tsx` renders a `NotAvailable` panel: the dataset holds
end-of-season ladders only (`team_season_results`, one row per team per grade per
season), so there is no record of who beat whom. Real head-to-head needs
match-level data, which means ingesting PlayHQ fixtures.

Separately, `/clubs` lists every club that has ever appeared, so the grid is
dominated by cards reading "not ranked in 2025". Clubs no longer competing should
be hidden by default behind a toggle.

## Decisions

- Head to head is built on **real match results**, not a ladder-derived proxy.
- Fixture ingestion scope for this cycle: **2025 and 2026 seasons only**, senior
  grades first, then juniors once seniors are proven end to end. Wider backfill is
  a later cycle.
- A club is **present** if it has a championship rank in the latest ranked year —
  the same fact the card already prints.
- Intra-club meetings (`Contax 1` v `Contax 2`) are excluded from head to head. A
  club cannot play itself, so this falls out of the query for free.
- Forfeits count as W/L. Byes, no-results and unplayed games do not count toward
  W-L-D, though no-results appear in the meetings list.
- 2022 Premier League does not exist on PlayHQ (COVID cancellation). Confirmed
  absent, not a gap to backfill.

## 1. Data layer

### Schema — new `games` table

```
games
  id              INTEGER PK
  gradeId         → grades.id (cascade)
  playhqId        TEXT
  round           INTEGER
  roundName       TEXT
  playedAt        INTEGER (epoch seconds, nullable)
  homeTeamId      → teams.id (nullable: byes)
  awayTeamId      → teams.id (nullable: byes)
  homeScore       INTEGER (nullable)
  awayScore       INTEGER (nullable)
  status          TEXT: 'final' | 'forfeit' | 'no_result' | 'bye' | 'scheduled'
  forfeitingSide  TEXT: 'home' | 'away' | null
  source          TEXT (Source)
  scrapedAt       INTEGER
  createdAt       TEXT default current_timestamp

uniqueIndex(gradeId, playhqId)
index(homeTeamId), index(awayTeamId), index(gradeId)
```

Games hang off `grades` rather than `seasons`: a grade already carries its season,
tier and division, so every existing season/grade/band filter applies to games
through one join.

`teams` already stores a grade-scoped `playhqId`, so PlayHQ fixture team IDs
resolve directly to our teams — no name matching. A game referencing an unknown
team ID **fails the import loudly**, matching the existing rule that a bad run
must never invent a club or team.

`status` is persisted rather than derived, so the "forfeits count" decision can be
revisited without a re-scrape. Goal differential sums only games with both scores
present, so a forfeit contributes a result but no goals.

### Fetch — `src/pipeline/fetch/games.ts`

Sits alongside `ladder.ts`, reusing `playhq-client.ts` and the org → season →
grade walk already in `src/pipeline/fetch/run.ts`.

**Gating spike (first task).** `docs/playhq-api.md` documents only
`discoverCompetitions`, `gradeListDiscoverSeason` and `gradeLadder`. No fixtures
query has been discovered. Recover it the way the others were recovered: fetch
PlayHQ's web bundle, grep the embedded query documents for the game/fixture
operation, verify with curl against a known grade ID, save the raw response under
`data/raw/probe/`, and append a §6 to `docs/playhq-api.md` covering the operation,
its variables, pagination behaviour and field mapping onto the table above.

If the operation requires authentication, the feature stops here and is
re-scoped — do not proceed to schema or UI work on an unverified assumption.

Fetch respects the existing self-imposed ~1 req/sec limit, caches per-grade
responses to disk, and is resumable. At 2025+2026 seniors the request count is
modest (tens of grades), so runtime is minutes, not hours.

### Import

CSV-in, SQL-out, same as every other table. Fixture CSVs are **split per season**
(`data/games-2025.csv`, `data/games-2026.csv`) to keep individual files reviewable
in git. Import fixture directory under
`src/pipeline/import/__fixtures__` follows the existing `basic` shape.

## 2. Head-to-head query

`src/db/queries/head-to-head.ts`, structured like `club-trend.ts`: a thin drizzle
select feeding a pure, DOM-free aggregator.

```ts
buildHeadToHead(rows: readonly GameRow[], clubA: string, clubB: string): HeadToHead
```

The select takes games where one side's team belongs to club A and the other to
club B, joined through `grades` → `seasons` for year, tier and grade name. The
aggregator normalises each row to club A's perspective:
`{ year, gradeName, tier, forClub, againstClub, result: 'W'|'L'|'D'|null, atHome, status, playedAt }`.

Result shape:

```ts
{
  record:   { played, won, drawn, lost, goalsFor, goalsAgainst },
  bySeason: { year, played, won, drawn, lost, goalDiff }[],
  byBand:   { tier, label, played, won, drawn, lost }[],
  meetings: { year, round, gradeName, teamA, teamB, scoreA, scoreB, status, result }[],
}
```

`meetings` is newest-first. `no_result` and `scheduled` games appear in `meetings`
flagged as such and contribute nothing to `record`. `bye` rows never match a
two-club query. Band labels come from the existing `bandLabel(tier)`.

## 3. Head-to-head page

`src/routes/head-to-head.tsx` replaces its `NotAvailable` panel, following the
`/ladders` search-param pattern:

- `validateSearch` zod schema: `{ a?, b?, year?, grade?, includePast? }`,
  `loaderDeps` derived from search, server fn falling back to valid defaults.
- Two `SearchableSelect` club pickers, plus `FieldSelect` for season and grade.
  The grade list is restricted to grades both clubs actually contested, so an
  empty combination cannot be selected.
- Distinct empty states: a prompt when fewer than two clubs are chosen, and a
  "these clubs have never met" panel when two valid clubs genuinely have no
  meetings — that is an answer, not a failure.
- Summary `Panel` (W–L–D and goal differential in `.numeric` / `.label-mono`
  style), a per-season strip, and a meetings `Table` with year, round, grade, both
  scores and the winner emphasised. Forfeits carry a `NoteMarker`.
- `accent.ts` club colours distinguish A from B throughout.
- `ShareBar` works unchanged because all state lives in the URL.
- The club profile page links to head to head against its most-played opponents.

## 4. Present/past club filtering

### Shared helper — `src/db/queries/club-activity.ts`

```ts
partitionClubs(clubs, rankedClubKeys): { present: Club[]; past: Club[] }
```

Pure and unit-tested, used by both the clubs index and the head-to-head pickers so
the two cannot drift. `loadClubs` already fetches the championship season, so the
ranked key set costs no additional query.

### UI

- Search param `includePast` (boolean, default `false`) on `/clubs` and
  `/head-to-head` — shareable, and back/forward behaves.
- New primitive `src/components/ui/toggle.tsx`, a segmented control on
  `@base-ui/react` in the manner of `select.tsx`, labelled **Present clubs** /
  **All clubs (incl. past)** and carrying a live count ("showing 24 of 61 clubs").
- With `includePast` on, past clubs render in the same grid but recessed
  (`text-ink-muted` name, unfilled accent dot) showing "last ranked 2016" instead
  of a dash.
- `/clubs` header copy states that ranks come from the latest championship season
  and that clubs no longer competing are hidden by default.
- On head to head the toggle applies to both pickers, with one exception: a club
  named directly in the URL stays selectable and visible regardless of the toggle,
  so a shared link involving a defunct club never silently breaks.

## 5. Testing

- `head-to-head.test.ts` — forfeits count, no-results do not, home/away
  normalisation, never-met returns an empty record, per-season and per-band
  rollups.
- `club-activity.test.ts` — partition behaviour, including a club with no ranked
  year at all and a dataset with no ranked year at all.
- Import fixture test for `games-<year>.csv`, including the unknown-team-ID
  failure path.
- Spike verified against a real grade, raw response committed under
  `data/raw/probe/`, findings appended to `docs/playhq-api.md`.
- `vp check` and `vp test` per the repo checklist.

## Out of scope

- Backfill of fixtures before 2025.
- Fixtures for archive-PDF-era seasons (2000–2016) — the source is ladders only.
- Player-level or round-by-round statistics.
- Ladder-derived "who finished higher" comparisons.
