# Head to head, plus present/past club filtering — design

Date: 2026-08-09

## Problem

`src/routes/head-to-head.tsx` renders a `NotAvailable` panel: the dataset holds
end-of-season ladders only (`team_season_results`, one row per team per grade per
season), so there is no record of who beat whom. Real head-to-head needs
match-level data, which means ingesting PlayHQ fixtures.

`src/routes/results.tsx` is blocked on the same gap and says so in its own
`NotAvailable` copy. The two pages have distinct jobs — `/results` is the fixture
list, `/head-to-head` is the club-versus-club record — but both unlock from one
`games` table, so they are built together.

Separately, `/clubs` lists every club that has ever appeared, so the grid is
dominated by cards reading "not ranked in 2025". Clubs no longer competing should
be hidden by default behind a toggle.

## Decisions

- Head to head is built on **real match results**, not a ladder-derived proxy.
- `/results` is the **fixture list** (season + grade + optional single club);
  `/head-to-head` is the **two-club record**. They share the query layer, not the
  page.
- Head to head filters on **club, club and grade band** — no season picker. Bands
  default to all, with a per-season breakdown in the body.
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
buildHeadToHead(
  rows: readonly GameRow[],
  clubA: string,
  clubB: string,
  band: number | 'all',
): HeadToHead
```

### Grade bands, not grade rows

`grades` is season-scoped: "Premier Division 2025" and "Premier Division 2026" are
separate rows with separate `gradeKey`s. A picker spanning every season therefore
selects a **band** (tier, via the existing `bandLabel(tier)`, which already
collapses divisions), never a grade row. The picker is labelled "Grade" in the UI
and carries an "All grades" option, which is the default.

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

- `validateSearch` zod schema: `{ a?, b?, band?, includePast? }`, `loaderDeps`
  derived from search, server fn falling back to valid defaults. `band` defaults
  to `all`. There is no season param — the record spans every season.
- Two `SearchableSelect` club pickers, plus one `FieldSelect` grade-band picker.
  The band list is restricted to bands the two clubs have actually met in, plus
  "All grades", so an empty combination cannot be selected.
- Premier League bands appear in the same picker as club-tier bands; nothing
  special-cases the competition.
- Distinct empty states: a prompt when fewer than two clubs are chosen, and a
  "these clubs have never met" panel when two valid clubs genuinely have no
  meetings — that is an answer, not a failure.
- Summary `Panel` (W–L–D and goal differential in `.numeric` / `.label-mono`
  style), a per-season strip, and a meetings `Table` with year, round, grade, both
  scores and the winner emphasised. Forfeits carry a `NoteMarker`.
- `accent.ts` club colours distinguish A from B throughout.
- `ShareBar` works unchanged because all state lives in the URL.
- The club profile page links to head to head against its most-played opponents.

## 4. Results page

`src/routes/results.tsx` replaces its `NotAvailable` panel with the fixture list
the page was always meant to be, using the `/ladders` search-param pattern:

- `validateSearch`: `{ year?, grade?, club? }`. Unlike head to head this page is
  season-scoped, so it selects a concrete **grade row** (season-scoped `gradeKey`),
  exactly as `/ladders` already does — the two pages can share the picker.
- Defaults to the latest season and its first grade. An optional single-club
  filter narrows to that club's games.
- Body is a `Table` of round, date, both teams, score and margin, grouped by round.
  Forfeits and no-results carry a `NoteMarker`.
- Where two distinct clubs are on the card, each row links to the head-to-head
  page for that pairing.

Both pages read through the same `games` select helpers; only the aggregation
differs.

## 5. Present/past club filtering

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

## 6. Testing

- `head-to-head.test.ts` — forfeits count, no-results do not, home/away
  normalisation, never-met returns an empty record, per-season and per-band
  rollups, and band filtering (a band filter must not change which games are
  counted for another band).
- `results.test.ts` — round grouping and margin calculation, including a forfeit
  and a bye.
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
