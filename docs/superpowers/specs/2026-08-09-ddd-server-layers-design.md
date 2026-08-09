# DDD server layers + endpoint test coverage — design

Date: 2026-08-09

## Problem

Every server function (`loadRankings`, `loadLadders`, `loadClubs`, `loadClub`,
`loadMethod`) and every function in `src/data/index.ts` is untested and
untestable: `getDb()` hard-imports `cloudflare:workers`, nothing injects a `Db`,
and the in-memory sqlite harness has never run a drizzle query. There is also a
latent bug: the ladders year fallback ends at `coverage.rankedYears[0]`, which
can be `undefined`, so `LaddersData.year` can be `undefined` at runtime despite
its `number` type.

## Decisions (user-confirmed)

- Layered DDD: routes → DTO ↔ services ← DTO → repos ← domain model.
- **Full DDD**: domain objects with behaviour, not anemic holders (risk flagged,
  reaffirmed).
- New DTOs with explicit mappers; domain objects never escape services.
- Services return `Result<T, DomainError>`; routes translate to HTTP
  (`notFound()` / error component). No throwing for expected outcomes.
- Repos take `Db` via factory arg; composition root `createServices(db)`.
- Safety net: route-loader smoke tests over in-memory sqlite — which requires
  the DI seam first, so the agreed sequencing is:
    1. Mechanical `Db`-threading through existing `src/data` functions, zero
       logic change.
    2. Loader smoke tests for all five server fns (valid, garbage, absent-data
       params).
    3. DDD layering under that net, one page-service at a time.
- Layout: `src/server/{dto,services,domain,repos}`; `src/data/index.ts` shrinks
  to re-exports during migration, deleted at the end. `src/db/` (schema,
  `getDb()`) unchanged.
- Ladders year-undefined bug fixed as part of this work, with a regression
  test.

## Layers

```
src/routes/*.tsx        parse search params → service → Result→HTTP → DTO out
src/server/dto/         wire shapes + zod schemas; the only thing routes see
src/server/services/    RankingsService, LaddersService, ClubsService, MethodService
src/server/domain/      Championship, Ladder, ClubHistory, Coverage, TableQuery,
                        Result<T,E>, DomainError
src/server/repos/       drizzle queries returning domain objects; Db injected
src/server/container.ts createServices(db: Db) — the composition root
```

Routes call `createServices(getDb())` inside the server fn; tests call
`createServices(testDb)`.

## Test DB

Drizzle over in-memory `node:sqlite` `DatabaseSync` via drizzle's sqlite-proxy
adapter (or the native node:sqlite adapter if the installed drizzle version
ships one — implementer verifies; either yields a `Db`-compatible handle).
Migrations applied from `drizzle/*.sql` as `sqlite-test-db.ts` does today, plus
a seed-fixture builder for tests.

## Domain model

Immutable classes: readonly fields, behaviour methods, static `from(rows)`
factories. Existing pure-function logic MOVES (tests convert with it), it is not
rewritten.

- **Coverage** — from season rows. `years()`, `rankedYears()`,
  `latestRankedYear(): Result<number, NoRankedSeasons>` (absorbs today's
  throw), `resolveYear(requested?): number | undefined` — the total version of
  the ladders fallback; `undefined` means an empty dataset and the service maps
  it to `EmptyDataset`, fixing the year-undefined bug.
- **Championship** — one season's ranked rows. `rows()`, `rankOf(clubKey)`,
  `size()`, `sorted(tableQuery)`; static
  `fromHistory(history, year): Result<Championship, SeasonNotRanked>`. Absorbs
  `sortChampionshipRows` and the `previousYear` logic.
- **ClubHistory** — a club's results across seasons. Absorbs `buildClubTrend`,
  `sortClubResults`, career aggregates, `lastRankedYear()`.
  `ClubDirectory.partition(clubs, championship)` replaces `partitionClubs`.
- **Ladder** — one grade's standings. Absorbs `sortLadderRows`; `teamCount()`
  returns the pre-slice total by construction.
- **TableQuery** — value object replacing `resolveTableState`/`applyTableState`:
  built from raw search params + per-table spec; clamps page to the row count;
  applies sort + slice. One place; existing tests move here.
- **Result<T, E> / DomainError** — discriminated union, `ok`/`err`, `map`,
  `unwrapOr`. Variants: `NotFound(kind, key)`, `NoRankedSeasons`,
  `EmptyDataset`. Routes translate `NotFound` → `notFound()`; the rest render
  the route error component.

Weights and grade summaries stay simple typed values carried by
Coverage/MethodService.

## DTOs and services

- DTOs live in `src/server/dto/`, one module per page (`rankings.dto.ts`,
  `ladders.dto.ts`, `clubs.dto.ts`, `club-profile.dto.ts`, `method.dto.ts`).
  They start as the existing `@/data/types` shapes (the UI already consumes
  them) and are owned by the DTO layer from then on; `@/data/types` is deleted
  with `src/data`.
- Each service exposes one method per loader need, e.g.
  `RankingsService.getPage(params): Promise<Result<RankingsPageDto, DomainError>>`.
  Services orchestrate repos, apply domain behaviour, and map domain → DTO.
  Mapping is explicit per DTO module (`toRankingsPageDto(...)`).
- Search-param parsing stays in routes (`-search-params.ts`, `-table-params.ts`
  unchanged); the parsed values are the service input.

## Testing

- **Smoke net (before layering):** for each of the five server fns, tests over
  in-memory sqlite with seeded fixtures: happy path, garbage params fall back
  to defaults, absent data (unknown club → NotFound; empty dataset →
  EmptyDataset; season with no grades → empty ladder state).
- **Domain tests:** the existing `src/db/queries/*.test.ts` suites move with
  their logic into `src/server/domain/*.test.ts`.
- **Repo tests:** each repo tested against the sqlite harness with real drizzle
  queries — the first time `fetch*` logic has coverage.
- **Regression:** ladders year-undefined — a dataset with zero seasons yields
  `EmptyDataset`, never an undefined year in a `number` field.
- `vp check` and `vp test` green at every migration step; visual output of all
  pages unchanged throughout.

## Out of scope

- Head-to-head / fixtures plans (separate, pending).
- Entity behaviour for weights/grades beyond simple values.
- Any UI change.
