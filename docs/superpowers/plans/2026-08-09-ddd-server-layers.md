# DDD Server Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every endpoint testable and tested by layering the server into routes → DTO ↔ services ← repos ← domain model, with a smoke net built before the restructuring, and fix the ladders year-undefined bug.

**Architecture:** Three phases, per the spec's agreed sequencing: (1) mechanical `Db`-threading and handler extraction with zero logic change, (2) loader smoke tests over an in-memory sqlite harness, (3) DDD layering under that net — immutable domain objects absorbing today's pure functions, repos taking an injected `Db`, services returning `Result<T, DomainError>`, routes translating to HTTP. `src/data/index.ts` shrinks to re-exports and is deleted at the end.

**Tech Stack:** TanStack Start server fns, drizzle-orm 0.45 (`d1` in prod, `sqlite-proxy` over `node:sqlite` in tests), zod, vitest.

## Global Constraints

- Validate with `vp check` and `vp test` (full suite). NEVER invoke npm/npx/vitest directly.
- Every migration step leaves the suite green and the rendered pages visually unchanged.
- Domain logic MOVES from `src/db/queries/*` — it is not rewritten; its tests move with it.
- Services return `Result<T, DomainError>`; no throwing for expected outcomes. Routes map `NotFound` → `notFound()`, other errors → route error component.
- Repos and services never call `getDb()`; the composition root `createServices(db)` is the only place a `Db` enters the graph, and routes are the only place `getDb()` is called.
- Routes only ever see DTOs from `src/server/dto/`; domain objects never escape services.
- No bitwise operators. String literals in JSX braced. TDD throughout.
- Branch: create `refactor/ddd-server-layers` from main. Commit after every task.

## File Structure

| Path                                                                           | Responsibility                                                                                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `src/server/testing/harness.ts`                                                | In-memory sqlite `Db` (drizzle sqlite-proxy over `node:sqlite`), migrations applied.                                   |
| `src/server/testing/fixtures.ts`                                               | Seed builder: competitions/seasons/grades/clubs/teams/results in one call.                                             |
| `src/server/loaders/*.ts`                                                      | Phase-1 extraction of each server fn's handler body: `(db, params) => Promise<Data>`. Replaced by services in phase 3. |
| `src/server/domain/result.ts`                                                  | `Result<T, E>`, `ok`, `err`, `DomainError` variants.                                                                   |
| `src/server/domain/{coverage,table-query,championship,club-history,ladder}.ts` | Domain objects.                                                                                                        |
| `src/server/repos/{seasons,championship,clubs,grades,weights}.repo.ts`         | Drizzle queries → domain objects; `Db` injected.                                                                       |
| `src/server/dto/{rankings,ladders,clubs,club-profile,method}.dto.ts`           | Wire shapes + mappers.                                                                                                 |
| `src/server/services/{rankings,ladders,clubs,method}.service.ts`               | Orchestration; Result out.                                                                                             |
| `src/server/container.ts`                                                      | `createServices(db: Db)`.                                                                                              |
| `src/db/index.ts`                                                              | `Db` type widened so D1 and proxy handles are interchangeable.                                                         |

---

### Task 1: Test DB harness

**Files:**

- Modify: `src/db/index.ts`
- Create: `src/server/testing/harness.ts`, `src/server/testing/fixtures.ts`
- Test: `src/server/testing/harness.test.ts`

**Interfaces:**

- Produces: `createTestDb(): Db` (in-memory, migrated); `seed(db, spec): Promise<SeedResult>` where `spec` nests `{ competitions: [{ key, name, seasons: [{ seasonKey, startYear, isFinal, grades: [{ gradeKey, name, tier, teamCount, results: [{ clubKey, clubName, displayName, ladderPosition, played?, won?, ... }] }] }] }] }` and `SeedResult` maps keys → row ids. Widened `Db` type.

- [ ] **Step 1: Widen the `Db` type**

```ts
// src/db/index.ts
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
/** Common supertype of the D1 handle (prod) and the sqlite-proxy handle (tests). */
export type Db = BaseSQLiteDatabase<'async', unknown, typeof schema>;
```

`getDb()` still returns the D1 drizzle instance; verify with `vp check` that it is assignable. If `BaseSQLiteDatabase` assignability fails on this drizzle version, fall back to `DrizzleD1Database<typeof schema> | SqliteRemoteDatabase<typeof schema>` is NOT acceptable (breaks call sites); instead find the narrowest common ancestor that compiles — record which in the report.

- [ ] **Step 2: Write the failing harness test**

```ts
// src/server/testing/harness.test.ts
import { describe, expect, it } from 'vitest';
import { clubs } from '@/db/schema';
import { createTestDb } from '@/server/testing/harness';
import { seed } from '@/server/testing/fixtures';

describe('test harness', () => {
    it('runs a real drizzle query against migrated in-memory sqlite', async () => {
        const db = createTestDb();
        await db.insert(clubs).values({ clubKey: 'contax', name: 'Contax' });
        const rows = await db.select().from(clubs);
        expect(rows).toHaveLength(1);
        expect(rows[0].clubKey).toBe('contax');
    });

    it('seeds a season graph and returns ids', async () => {
        const db = createTestDb();
        const ids = await seed(db, {
            competitions: [
                {
                    key: 'amnd',
                    name: 'AMND',
                    seasons: [
                        {
                            seasonKey: 'amnd-2025',
                            startYear: 2025,
                            isFinal: true,
                            grades: [
                                {
                                    gradeKey: 'a1-2025',
                                    name: 'A1',
                                    tier: 2,
                                    teamCount: 2,
                                    results: [
                                        {
                                            clubKey: 'contax',
                                            clubName: 'Contax',
                                            displayName: 'Contax',
                                            ladderPosition: 1,
                                        },
                                        {
                                            clubKey: 'garville',
                                            clubName: 'Garville',
                                            displayName: 'Garville',
                                            ladderPosition: 2,
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        });
        expect(ids.clubs.get('contax')).toBeTypeOf('number');
        const all = await db.select().from(clubs);
        expect(all).toHaveLength(2);
    });
});
```

- [ ] **Step 3: Run to verify failure** — `vp test src/server/testing/harness.test.ts` → FAIL, module not found.

- [ ] **Step 4: Implement**

`harness.ts`: `new DatabaseSync(':memory:')` from `node:sqlite`; apply every `drizzle/*.sql` in name order (reuse the split/apply approach in `src/pipeline/import/sqlite-test-db.ts` — read it first); wrap with `drizzle` from `drizzle-orm/sqlite-proxy`:

```ts
const db = drizzle(
    async (sql, params, method) => {
        const stmt = sqlite.prepare(sql);
        if (method === 'run') {
            stmt.run(...(params as SQLInputValue[]));
            return { rows: [] };
        }
        const rows = stmt
            .raw()
            .all(...(params as SQLInputValue[])) as unknown[][];
        return method === 'get' ? { rows: rows[0] ?? [] } : { rows };
    },
    { schema, casing: 'snake_case' },
) as Db;
```

Note: sqlite-proxy expects ROW ARRAYS (`.raw()`), not objects — getting this wrong makes every select return garbage; the harness test catches it. `fixtures.ts` inserts the nested spec with plain drizzle inserts, defaulting `competitionPeriod: 'winter'`, `endYear: startYear`, `source: 'playhq'`, `placementBasis: 'regular_season_ladder'`, `division: null`, and auto-creating grade_weights rows (tier weight 1) so championship scoring works. Season label defaults to `String(startYear)`.

- [ ] **Step 5: Run to verify pass** — `vp test src/server/testing/harness.test.ts` then full `vp check && vp test`.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: in-memory drizzle test harness"`

---

### Task 2: Thread `Db` through `src/data` and extract loader functions

**Files:**

- Modify: `src/data/index.ts` (every function gains `db: Db` as FIRST parameter; delete the internal `getDb()` calls and the `import { getDb }`)
- Create: `src/server/loaders/rankings.ts`, `ladders.ts`, `clubs-index.ts`, `club-profile.ts`, `method.ts`
- Modify: `src/routes/index.tsx`, `ladders.tsx`, `clubs.index.tsx`, `clubs.$clubKey.tsx`, `method.tsx`

**Interfaces:**

- Produces (each loader file exports one function, its body MOVED VERBATIM from the route's handler):
    - `loadRankingsData(db: Db, params: { season?: number; sort?: string; dir?: 'asc'|'desc'; page?: number; pageSize?: number }): Promise<RankingsData>`
    - `loadLaddersData(db: Db, params: { year?: number; grade?: string; sort?; dir?; page?; pageSize? }): Promise<LaddersData>`
    - `loadClubsIndexData(db: Db, params: { includePast?: boolean }): Promise<ClubIndexData>`
    - `loadClubProfileData(db: Db, params: { clubKey: string; sort?; dir?; page?; pageSize? }): Promise<ClubData | null>`
    - `loadMethodData(db: Db): Promise<MethodData>`
- The `*Data` interfaces move from the route files into the loader files; routes re-export them so component imports keep working.

- [ ] **Step 1: Thread db through `src/data/index.ts`** — mechanical: `listClubs()` → `listClubs(db: Db)`, body `fetchClubs(db)`; same for all. No logic changes whatsoever.
- [ ] **Step 2: Extract each handler body** into its loader function; each route's server fn becomes `handler(async ({ data }) => loadXxxData(getDb(), data))` with `getDb` imported in the route. Move the `Data` interface; re-export from the route.
- [ ] **Step 3: Verify zero drift** — `git diff` must show only signature threading and code motion; `vp check && vp test` green (existing 247 tests unaffected).
- [ ] **Step 4: Commit** — `"refactor: inject Db and extract route loader functions"`

---

### Task 3: Smoke net — rankings and ladders loaders

**Files:**

- Test: `src/server/loaders/rankings.test.ts`, `src/server/loaders/ladders.test.ts`

**Interfaces:**

- Consumes: Task 1 harness/fixtures, Task 2 loader functions.

Seed for both: two final seasons (2024, 2025) with one tier-2 grade of 3 clubs each, plus one non-final 2026 season.

- [ ] **Step 1: Write the tests (all failing or passing as characterisation — they must run)**

`rankings.test.ts` cases:

```ts
it('returns the latest ranked season by default', ...)        // year === 2025
it('falls back to latest when season is not ranked', ...)     // { season: 1999 } → 2025
it('honours a valid requested season', ...)                   // { season: 2024 } → 2024, previousYear null
it('clamps an out-of-range page to the last page', ...)       // { page: 999 } → rows non-empty
it('rejects a sort column outside the allow-list', ...)       // { sort: 'evil' } → tableState.sort === 'rank'
```

`ladders.test.ts` cases:

```ts
it('defaults to the latest season and its first grade', ...)
it('falls back to first grade when grade key is unknown', ...)
it('returns ladder null for a season with no grades', ...)    // seed an empty final season
it('characterises the empty-dataset year bug', ...)           // empty db: currently year becomes undefined — assert current behaviour with a comment naming the fix task (Task 5 makes this an EmptyDataset error); typed as number, so assert via `expect(result.year).toBeUndefined()` cast through unknown
```

- [ ] **Step 2: Run, adjust seeds until green** — these are characterisation tests of behaviour that phase 3 must preserve (except the named bug).
- [ ] **Step 3: Commit** — `"test: smoke net for rankings and ladders loaders"`

---

### Task 4: Smoke net — clubs index, club profile, method loaders

**Files:**

- Test: `src/server/loaders/clubs-index.test.ts`, `club-profile.test.ts`, `method.test.ts`

Cases:

```ts
// clubs-index
it('hides unranked clubs by default and orders present before past', ...)
it('includes past clubs with includePast, with lastRankedYear filled', ...)
it('fills null rank/points/teams for clubs absent from the championship', ...)
// club-profile
it('returns null for an unknown club key', ...)
it('returns the profile with paginated results for a known club', ...)
it('clamps page and reports pre-slice totalRows', ...)
// method
it('returns coverage years and grade weights', ...)
```

- [ ] **Step 1: Write, run, green.** Same seed builder; club-profile seed needs a club with results in ≥2 seasons.
- [ ] **Step 2: Commit** — `"test: smoke net for clubs and method loaders"`

---

### Task 5: Domain — `Result` and `Coverage` (bug fix lands here)

**Files:**

- Create: `src/server/domain/result.ts` + `result.test.ts`
- Create: `src/server/domain/coverage.ts` + `coverage.test.ts` (logic and tests MOVE from `src/db/queries/coverage.ts` and its callers)
- Modify: `src/server/loaders/ladders.ts`, `src/data/index.ts` (getCoverage/latestRankedYear delegate to Coverage)

**Interfaces:**

- Produces:

```ts
type Result<T, E> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: E };
const ok: <T>(value: T) => Result<T, never>;
const err: <E>(error: E) => Result<never, E>;
type DomainError =
    | {
          readonly kind: 'not-found';
          readonly entity: 'club' | 'season' | 'grade';
          readonly key: string;
      }
    | { readonly kind: 'no-ranked-seasons' }
    | { readonly kind: 'empty-dataset' };

class Coverage {
    static from(seasons: readonly SeasonRow[]): Coverage;
    years(): readonly number[];
    rankedYears(): readonly number[];
    latestRankedYear(): Result<number, DomainError>; // absorbs today's throw
    resolveYear(requested?: number): number | undefined; // undefined ⇔ empty dataset
}
```

- [ ] **Step 1: TDD `result.ts`** — tests for ok/err narrowing, `map`, `unwrapOr`.
- [ ] **Step 2: TDD `coverage.ts`** — move `coveredYears`/`rankedYears`/`buildCoverage` logic into the class; port existing behaviour; add:

```ts
it('resolveYear returns undefined only for an empty dataset', ...)
it('resolveYear falls back to the latest year for an unknown request', ...)
it('latestRankedYear errs with no-ranked-seasons instead of throwing', ...)
```

- [ ] **Step 3: Fix the ladders bug** — `loadLaddersData` uses `coverage.resolveYear(...)`; on `undefined` it now returns an explicit empty-dataset shape (`{ years: [], year: null, grades: [], ladder: null }` — change `LaddersData.year` to `number | null` and render the existing "no grades" panel when null). Flip Task 3's characterisation test into the real assertion (`year` is `null`, page renders empty state). Update `ladders-page.tsx` for the nullable year (guard the `FieldSelect` value).
- [ ] **Step 4:** `vp check && vp test` green. Commit — `"feat: Result type and Coverage domain object; fix undefined ladders year"`

---

### Task 6: Domain — `TableQuery`, `Championship`, `Ladder`, `ClubHistory`

**Files:**

- Create: `src/server/domain/table-query.ts`, `championship.ts`, `ladder.ts`, `club-history.ts`, each with a `.test.ts`
- Delete (as each move completes): the moved functions from `src/db/queries/pagination.ts`, `championship.ts`, `grades.ts`, `club-profile.ts`, `club-trend.ts`, `club-activity.ts` — leaving any repo-only fetch code in place for Task 7.

**Interfaces:**

```ts
class TableQuery {
    // absorbs resolveTableState/applyTableState/offsetFor/pageCount
    static from(raw: RawTableState, spec: TableSpec): TableQuery;
    apply<T>(
        rows: readonly T[],
        sort: (rows: readonly T[], q: TableQuery) => readonly T[],
    ): { rows: readonly T[]; totalRows: number; state: TableState };
}
class Championship {
    // absorbs sortChampionshipRows + previousYear
    static fromHistory(
        history: readonly ChampionshipSeason[],
        year: number,
    ): Result<Championship, DomainError>;
    rows(): readonly ChampionshipRow[];
    size(): number;
    previousYear(coverage: Coverage): number | null;
    sorted(q: TableQuery): { rows; totalRows; state };
    rankedClubKeys(): ReadonlySet<string>;
}
class Ladder {
    // absorbs sortLadderRows
    static from(grade: LadderGrade, rows: readonly LadderRow[]): Ladder;
    teamCount(): number; // pre-slice, always
    sorted(q: TableQuery): { rows; totalRows; state };
}
class ClubHistory {
    // absorbs buildClubTrend, sortClubResults, career aggregates, lastRankedYear
    static from(
        club: Club,
        results: readonly ResultRow[],
        rankedYears: readonly number[],
    ): ClubHistory;
    trend(): ClubTrend;
    sortedResults(q: TableQuery): { rows; totalRows; state };
    lastRankedYear(): number | null;
}
class ClubDirectory {
    // absorbs partitionClubs
    static partition(
        clubs: readonly Club[],
        ranked: ReadonlySet<string>,
    ): { present: readonly Club[]; past: readonly Club[] };
}
```

- [ ] **Step 1:** Move one module at a time, tests first (the existing test files move and re-target the class API — assertions unchanged). After each move, `vp test` full green before the next.
- [ ] **Step 2:** Loader functions switch to the domain objects as each lands (smoke net proves no behaviour drift).
- [ ] **Step 3:** Commit per moved object — `"refactor: <X> domain object"` (4–5 commits).

---

### Task 7: Repos

**Files:**

- Create: `src/server/repos/seasons.repo.ts`, `championship.repo.ts`, `clubs.repo.ts`, `grades.repo.ts`, `weights.repo.ts`, each with a `.test.ts` against the harness
- Delete: remaining fetch code in `src/db/queries/*` as it moves

**Interfaces:**

```ts
const createSeasonsRepo: (db: Db) => { coverage(): Promise<Coverage> };
const createChampionshipRepo: (db: Db) => {
    history(): Promise<readonly ChampionshipSeason[]>;
};
const createClubsRepo: (db: Db) => {
    all(): Promise<readonly Club[]>;
    historyOf(clubKey: string): Promise<Result<ClubHistory, DomainError>>; // not-found for unknown key
};
const createGradesRepo: (db: Db) => {
    forYear(year: number): Promise<readonly GradeSummary[]>;
    ladder(gradeKey: string): Promise<Result<Ladder, DomainError>>;
};
const createWeightsRepo: (db: Db) => {
    all(): Promise<readonly GradeWeightRow[]>;
};
```

- [ ] **Step 1:** TDD each repo on the harness — first real coverage of the `fetch*` drizzle queries. Test cases per repo: happy path over seeded data; unknown-key → `not-found`; empty table → empty collection (not an error) except where the interface says `Result`.
- [ ] **Step 2:** Commit per repo — `"feat: <x> repo with harness tests"`.

---

### Task 8: DTOs, services, container; routes switch; delete `src/data`

**Files:**

- Create: `src/server/dto/*.dto.ts` (types move from `@/data/types`, mappers `toXxxDto(domain): XxxDto`), `src/server/services/*.service.ts` + tests, `src/server/container.ts`
- Modify: all five routes; `src/server/loaders/*` DELETED (services replace them; smoke tests re-target services with identical assertions)
- Delete: `src/data/` entirely; empty remains of `src/db/queries/`

**Interfaces (exemplar; the other three follow the same shape):**

```ts
// services/rankings.service.ts
const createRankingsService: (repos: Repos) => {
    getPage(
        params: RankingsParams,
    ): Promise<Result<RankingsPageDto, DomainError>>;
};
// container.ts
interface Repos {
    seasons;
    championship;
    clubs;
    grades;
    weights;
}
function createServices(db: Db): { rankings; ladders; clubs; method };
```

Route pattern (all five):

```ts
.handler(async ({ data }) => {
    const result = await createServices(getDb()).rankings.getPage(data);
    if (!result.ok) {
        if (result.error.kind === 'not-found') throw notFound();
        throw new Error(describeDomainError(result.error)); // rendered by the route errorComponent
    }
    return result.value;
});
```

- [ ] **Step 1:** One page at a time: service + DTO (TDD, re-targeting that page's smoke tests), route switch, delete its loader. Full suite green between pages.
- [ ] **Step 2:** After the last page: delete `src/data/`, fix imports (components import DTO types from `@/server/dto/*`), `grep -rn "@/data" src/` must return nothing.
- [ ] **Step 3:** `vp check && vp test`; run `vp dev` and spot-check all five pages render identically (rankings sort/page URLs, ladders year/grade, clubs toggle, a club profile, method).
- [ ] **Step 4:** Commit per page + final cleanup commit — `"refactor: <page> service behind DTO boundary"`, `"chore: delete src/data layer"`.

---

## Self-Review Notes

Spec coverage: sequencing phases 1–3 → Tasks 2, 3–4, 5–8. Bug fix → Task 5. Full-DDD domain objects → Tasks 5–6. Repos with injected Db → Task 7. DTO boundary + Result + container + routes → Task 8. Harness → Task 1. All existing pure-function tests move rather than being rewritten (Tasks 5–6). The `Db` type widening in Task 1 is the one speculative step; its fallback instruction is explicit and the harness test gates it.
