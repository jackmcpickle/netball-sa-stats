# Head-to-head and Results Pages Implementation Plan

> **STATUS: COMPLETE (as of 2026-08-12).**
>
> **One rule in this plan is WRONG and was not implemented as written.**
> Global Constraints below say "Goal totals only count games with both scores
> present". They do not: PlayHQ fabricates a nominal 0–20 scoreline on every
> forfeit row, so goal totals filter on `status`, and a forfeit contributes a
> result but no goals. See `src/db/schema.ts` (the `games` docblock) and
> `buildHeadToHead` in `src/server/domain/head-to-head.ts`. The same applies
> to `marginFor`: a forfeit has no margin. The constraint was written before
> the API was probed.
>
> The File Structure table is also stale — it predates the DDD refactor and
> targets `src/db/queries/*` plus a `src/data/index.ts` that no longer exists.
> As built:
>
> | Plan says                            | Actually lives at                                                                                                   |
> | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
> | `src/db/queries/head-to-head.ts`     | `src/server/domain/head-to-head.ts`                                                                                 |
> | `src/db/queries/games.ts`            | `src/server/repos/games.repo.ts`                                                                                    |
> | `src/db/queries/results.ts` (create) | `src/server/domain/fixtures.ts` — the existing `src/db/queries/results.ts` is the _ladder_ query and was left alone |
> | `src/data/index.ts`                  | `src/server/services/{head-to-head,results}.service.ts` via `createServices`                                        |
> | `src/data/types.ts`                  | `src/server/dto/{head-to-head,results}.dto.ts`                                                                      |
>
> Two further departures: the meetings and fixture tables are paged through
> `TableQuery`, and since 2026-08-12 the fixture list sorts and slices in SQL.
> Task 3 Step 2 item 7 asks for a `ShareBar`; the component of that name in
> this repo is a bar chart, and no share-link UI exists, so it was skipped.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two `NotAvailable` stubs with real pages — `/head-to-head` showing the record between two clubs across every season, and `/results` listing every fixture for a season and grade.

**Architecture:** Both read the `games` table through pure aggregators under `src/db/queries/`, following `club-trend.ts` — a thin drizzle select feeding a DOM-free function that is unit-tested directly. Pages follow the `/ladders` search-param pattern and render through the generic `DataTable`.

**Tech Stack:** TanStack Start + Router + Table, drizzle-orm on D1, zod, Tailwind v4, Base UI, vitest.

## Prerequisites

- **`docs/superpowers/plans/2026-08-09-fixture-ingestion.md` complete** — there is no `games` table before it.
- **`docs/superpowers/plans/2026-08-09-club-filter-and-data-table.md` Tasks 1, 2, 4, 5, 6 complete** — this plan consumes `partitionClubs`, `SegmentedToggle`, `resolveTableState`, `tableSearchSchema` and `DataTable`.

## Global Constraints

- Validate with `vp check` and `vp test`. Never invoke `npm`/`vitest` directly.
- Route loaders read from `src/data/index.ts` only, never `src/db/*` directly.
- String literals in JSX are wrapped in braces: `{'Head to head'}`.
- Tokens only: `text-ink`, `text-ink-body`, `text-ink-muted`, `bg-paper`, `bg-paper-sunken`, `border-rule`, `rounded-card`, `.numeric`, `.label-mono`.
- Forfeits count toward W-L-D; `bye`, `no_result` and `scheduled` do not. ~~Goal totals only count games with both scores present.~~ **Corrected 2026-08-12: goal totals count `final` games only — a forfeit's 0–20 scoreline is fabricated by PlayHQ, so it contributes a result but no goals.**
- Head-to-head filters on **club, club and grade band** — there is no season filter. Bands come from `bandLabel(tier)` in `src/pipeline/scoring/bands.ts`, because `grades` rows are season-scoped and cannot back a cross-season picker.
- Default page size 50, `pageSize` clamped to `[25, 50, 100]`.
- Branch is `feature/head-to-head`. Commit after every task.

## File Structure

| File                                                         | Responsibility                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/db/queries/games.ts` (create)                           | Shared drizzle selects over `games` (join to grades/seasons/teams/clubs). |
| `src/db/queries/head-to-head.ts` (create)                    | Pure `buildHeadToHead` aggregator.                                        |
| `src/db/queries/head-to-head.test.ts` (create)               | Aggregator tests.                                                         |
| `src/db/queries/results.ts` (create)                         | Fixture-list query + `RESULTS_TABLE_SPEC`.                                |
| `src/db/queries/results.test.ts` (create)                    | Margin and grouping tests.                                                |
| `src/data/index.ts` (modify)                                 | `getHeadToHead`, `getResults`, `listH2hBands`.                            |
| `src/data/types.ts` (modify)                                 | `HeadToHead`, `Meeting`, `ResultRow` contracts.                           |
| `src/routes/head-to-head.tsx` (modify)                       | Search params, loader, replaces the stub.                                 |
| `src/components/head-to-head/head-to-head-page.tsx` (create) | Pickers, summary, meetings table.                                         |
| `src/routes/results.tsx` (modify)                            | Search params, loader, replaces the stub.                                 |
| `src/components/results/results-page.tsx` (create)           | Filters + fixture table.                                                  |
| `src/components/club/club-profile-page.tsx` (modify)         | Links to top opponents.                                                   |

---

### Task 1: Head-to-head aggregator

**Files:**

- Create: `src/db/queries/head-to-head.ts`
- Test: `src/db/queries/head-to-head.test.ts`

**Interfaces:**

- Consumes: `bandLabel` from `@/pipeline/scoring/bands`.
- Produces:

    ```ts
    interface GameFact {
        year: number; tier: number; gradeName: string;
        round: number | null; playedAt: number | null;
        homeClubKey: string | null; awayClubKey: string | null;
        homeTeamName: string; awayTeamName: string;
        homeScore: number | null; awayScore: number | null;
        status: 'final' | 'forfeit' | 'no_result' | 'bye' | 'scheduled';
    }
    interface Record_ { played; won; drawn; lost; goalsFor; goalsAgainst }
    interface Meeting { year; round; gradeName; teamA; teamB; scoreA; scoreB; status; result: 'W'|'L'|'D'|null }
    interface HeadToHead {
        record: Record_;
        bySeason: readonly { year; played; won; drawn; lost; goalDiff }[];
        byBand: readonly { tier; label; played; won; drawn; lost }[];
        meetings: readonly Meeting[];
    }
    buildHeadToHead(facts: readonly GameFact[], clubA: string, clubB: string, band: number | 'all'): HeadToHead
    ```

    Every figure is from club A's perspective.

- [ ] **Step 1: Write the failing test**

```ts
// src/db/queries/head-to-head.test.ts
import { describe, expect, it } from 'vitest';
import { buildHeadToHead, type GameFact } from '@/db/queries/head-to-head';

function fact(overrides: Partial<GameFact>): GameFact {
    return {
        year: 2025,
        tier: 1,
        gradeName: 'Premier Division',
        round: 1,
        playedAt: null,
        homeClubKey: 'a',
        awayClubKey: 'b',
        homeTeamName: 'A',
        awayTeamName: 'B',
        homeScore: 50,
        awayScore: 40,
        status: 'final',
        ...overrides,
    };
}

describe('buildHeadToHead', () => {
    it('counts a home win for club A', () => {
        const h2h = buildHeadToHead([fact({})], 'a', 'b', 'all');
        expect(h2h.record).toEqual({
            played: 1,
            won: 1,
            drawn: 0,
            lost: 0,
            goalsFor: 50,
            goalsAgainst: 40,
        });
    });

    it('normalises an away game to club A perspective', () => {
        // Same scoreline, sides swapped: A must still be the loser here.
        const h2h = buildHeadToHead(
            [fact({ homeClubKey: 'b', awayClubKey: 'a' })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.lost).toBe(1);
        expect(h2h.record.goalsFor).toBe(40);
    });

    it('counts a forfeit as a result', () => {
        const h2h = buildHeadToHead(
            [fact({ status: 'forfeit', homeScore: 20, awayScore: 0 })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(1);
        expect(h2h.record.won).toBe(1);
    });

    it('excludes a no-result from the record but keeps it in meetings', () => {
        const h2h = buildHeadToHead(
            [fact({ status: 'no_result', homeScore: null, awayScore: null })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(0);
        expect(h2h.meetings).toHaveLength(1);
        expect(h2h.meetings[0].result).toBeNull();
    });

    it('excludes scheduled games from the record', () => {
        const h2h = buildHeadToHead(
            [fact({ status: 'scheduled', homeScore: null, awayScore: null })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(0);
    });

    it('counts a draw', () => {
        const h2h = buildHeadToHead(
            [fact({ homeScore: 44, awayScore: 44 })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.drawn).toBe(1);
    });

    it('returns an empty record when the clubs have never met', () => {
        const h2h = buildHeadToHead([], 'a', 'b', 'all');
        expect(h2h.record.played).toBe(0);
        expect(h2h.meetings).toEqual([]);
        expect(h2h.bySeason).toEqual([]);
    });

    it('ignores games involving neither club', () => {
        const h2h = buildHeadToHead(
            [fact({ homeClubKey: 'c', awayClubKey: 'd' })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(0);
    });

    it('ignores games where only one of the two clubs appears', () => {
        const h2h = buildHeadToHead(
            [fact({ awayClubKey: 'c' })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(0);
    });

    it('never counts an intra-club game', () => {
        // A cannot play A; a same-club fixture must not become a phantom meeting.
        const h2h = buildHeadToHead(
            [fact({ homeClubKey: 'a', awayClubKey: 'a' })],
            'a',
            'a',
            'all',
        );
        expect(h2h.record.played).toBe(0);
    });

    it('filters to a single band without disturbing other bands', () => {
        const facts = [
            fact({ tier: 1 }),
            fact({
                tier: 4,
                gradeName: 'Junior 2',
                homeScore: 10,
                awayScore: 30,
            }),
        ];
        expect(buildHeadToHead(facts, 'a', 'b', 1).record.played).toBe(1);
        expect(buildHeadToHead(facts, 'a', 'b', 1).record.won).toBe(1);
        expect(buildHeadToHead(facts, 'a', 'b', 4).record.lost).toBe(1);
        expect(buildHeadToHead(facts, 'a', 'b', 'all').record.played).toBe(2);
    });

    it('rolls up by season, newest first in meetings', () => {
        const h2h = buildHeadToHead(
            [fact({ year: 2024 }), fact({ year: 2026 })],
            'a',
            'b',
            'all',
        );
        expect(h2h.bySeason.map((s) => s.year)).toEqual([2024, 2026]);
        expect(h2h.meetings[0].year).toBe(2026);
    });

    it('excludes byes, which have only one side', () => {
        const h2h = buildHeadToHead(
            [fact({ status: 'bye', awayClubKey: null, awayScore: null })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(0);
        expect(h2h.meetings).toEqual([]);
    });

    it('omits goals for a forfeit with no recorded score', () => {
        const h2h = buildHeadToHead(
            [fact({ status: 'forfeit', homeScore: null, awayScore: null })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.goalsFor).toBe(0);
        expect(h2h.record.goalsAgainst).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/db/queries/head-to-head.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Structure the implementation as: filter to games where `{home,away}` club keys
are exactly `{clubA, clubB}` and the two differ; apply the band filter; map each
to an A-perspective view; then fold into the four outputs. A forfeit with no
score contributes a result but no goals — guard the goal accumulation on both
scores being non-null, not on status.

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/db/queries/head-to-head.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/queries/head-to-head.ts src/db/queries/head-to-head.test.ts
git commit -m "feat: head-to-head aggregator"
```

---

### Task 2: Games select layer

**Files:**

- Create: `src/db/queries/games.ts`
- Modify: `src/data/types.ts`
- Modify: `src/data/index.ts`

**Interfaces:**

- Consumes: `games`, `grades`, `seasons`, `teams`, `clubs` from `@/db/schema`;
  `GameFact` from Task 1.
- Produces:

    ```ts
    fetchGameFactsForPair(db, clubA: string, clubB: string): Promise<readonly GameFact[]>
    fetchMeetingBands(db, clubA: string, clubB: string): Promise<readonly { tier: number; label: string }[]>
    // in @/data:
    getHeadToHead(clubA, clubB, band): Promise<HeadToHead>
    listH2hBands(clubA, clubB): Promise<readonly BandOption[]>
    ```

- [ ] **Step 1: Write the select**

Join `games` → `grades` → `seasons` for year and tier, and both team columns to
`teams` → `clubs` for the two club keys and display names. Use two aliased joins
(`alias(teams, 'homeTeams')` from `drizzle-orm/sqlite-core`) — a single join
cannot resolve both sides.

Filter in SQL to games where one side's club is A and the other is B, so the
aggregator receives only relevant rows. The pair filter is an `or` of two `and`s
(A home & B away, B home & A away).

- [ ] **Step 2: Expose through the data layer**

Add to `src/data/index.ts`:

```ts
export async function getHeadToHead(
    clubA: string,
    clubB: string,
    band: number | 'all',
): Promise<HeadToHead> {
    return buildHeadToHead(
        await fetchGameFactsForPair(getDb(), clubA, clubB),
        clubA,
        clubB,
        band,
    );
}
```

`listH2hBands` returns the distinct tiers the pair has actually met in, labelled
via `bandLabel`, so the picker cannot offer an empty combination.

- [ ] **Step 3: Verify**

Run: `vp check && vp test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/db/queries/games.ts src/data/index.ts src/data/types.ts
git commit -m "feat: game fact selects for head to head"
```

---

### Task 3: Head-to-head page

**Files:**

- Modify: `src/routes/head-to-head.tsx`
- Create: `src/components/head-to-head/head-to-head-page.tsx`

**Interfaces:**

- Consumes: `getHeadToHead`, `listH2hBands`, `listClubs`, `partitionClubs`,
  `SegmentedToggle`, `DataTable`, `SearchableSelect`, `FieldSelect`.
- Produces: `HeadToHeadData` = `{ clubs, includePast, a, b, band, bands, h2h }`
  where `a`/`b` are `Club | null` and `h2h` is `HeadToHead | null`.

- [ ] **Step 1: Replace the route**

Search schema: `{ a: z.string().optional(), b: z.string().optional(), band: z.union([z.literal('all'), z.number()]).optional(), includePast: z.coerce.boolean().optional() }`,
merged with `tableSearchSchema` for the meetings table.

The loader validates `a` and `b` against the club list and drops anything
unknown, resolves `band` against `listH2hBands` (falling back to `'all'`), and
returns `h2h: null` when fewer than two distinct clubs are selected.

**Picker visibility rule:** the club options are `partitionClubs(...)`'s
`present` unless `includePast` is true — _plus_ whichever of `a`/`b` is
currently selected, always. A shared link naming a defunct club must not lose
its own selection.

- [ ] **Step 2: Build the page component**

Layout top to bottom:

1. `Eyebrow` `{'HEAD TO HEAD'}` and `PageTitle`.
2. Filter row: two `SearchableSelect` club pickers, one `FieldSelect` grade-band
   picker whose first option is `{'All grades'}`, and the `SegmentedToggle`.
3. Empty states — a `Panel` prompting for two clubs when `h2h` is null, and a
   distinct `Panel` reading `{'These clubs have never met.'}` when `h2h` exists
   but `record.played === 0` and `meetings` is empty. These are different
   answers and must not share copy.
4. Summary `Panel`: W–L–D in `.numeric`, goal differential signed, and the two
   club names in their `accentText` colours.
5. Per-season strip: one row per `bySeason` entry.
6. Meetings `DataTable` with columns `year`, `round`, `gradeName`,
   `teamA`, `scoreA`, `scoreB`, `teamB`, sortable on `year` and `gradeName`.
   A `NoteMarker` on forfeits and no-results.
7. `ShareBar`, which works unchanged because all state is in the URL.

- [ ] **Step 3: Verify by hand**

Run: `vp dev`. Check: picking two clubs updates the URL; reloading restores the
view; a club that has never met the other shows the never-met panel, not zeros;
switching band changes the record; the toggle reveals past clubs; a URL naming a
past club keeps it selected with the toggle off.

- [ ] **Step 4: Verify automated**

Run: `vp check && vp test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/head-to-head.tsx src/components/head-to-head/
git commit -m "feat: head-to-head page"
```

---

### Task 4: Results fixture list

**Files:**

- Create: `src/db/queries/results.ts`
- Test: `src/db/queries/results.test.ts`
- Modify: `src/routes/results.tsx`
- Create: `src/components/results/results-page.tsx`

**Interfaces:**

- Consumes: `resolveTableState`, `offsetFor`, `DataTable`, existing
  `listGrades`, `getCoverage`.
- Produces: `RESULTS_TABLE_SPEC` (`sortable: ['round','playedAt','home','away','margin']`,
  default `round` ascending) and `fetchResults(db, gradeKey, clubKey, state)`
  returning `{ rows, totalRows }`.

- [ ] **Step 1: Write the failing test for margin**

```ts
// src/db/queries/results.test.ts
import { describe, expect, it } from 'vitest';
import { marginFor } from '@/db/queries/results';

describe('marginFor', () => {
    it('is the absolute score difference for a played game', () => {
        expect(
            marginFor({ homeScore: 50, awayScore: 32, status: 'final' }),
        ).toBe(18);
    });

    it('is zero for a draw', () => {
        expect(
            marginFor({ homeScore: 40, awayScore: 40, status: 'final' }),
        ).toBe(0);
    });

    it('is null when a score is missing', () => {
        expect(
            marginFor({ homeScore: null, awayScore: 30, status: 'no_result' }),
        ).toBeNull();
    });

    it('is null for a bye, which has no opponent', () => {
        expect(
            marginFor({ homeScore: null, awayScore: null, status: 'bye' }),
        ).toBeNull();
    });
});
```

- [ ] **Step 2: Run it, watch it fail, implement, watch it pass**

Run: `vp test src/db/queries/results.test.ts`
Expected: FAIL then PASS.

- [ ] **Step 3: Write the paginated query**

`fetchResults` is season-scoped: it filters on a concrete `gradeKey` (matching
`/ladders`), optionally on a club key appearing on either side, orders by the
allow-listed column with `games.id` as the tiebreaker, and applies
`limit`/`offset`. A sibling `count()` over the same `where` gives `totalRows`.

The `games.id` tiebreaker matters: many games share a round number, and without
it SQLite may return a different order per page, so rows repeat or vanish.

- [ ] **Step 4: Build the route and page**

Search schema `{ year?, grade?, club? }` merged with `tableSearchSchema`.
Defaults: latest season, that season's first grade — reuse the fallback logic in
`src/routes/ladders.tsx` verbatim. Changing year, grade or club resets `page` to 1.

The table columns are round, date, home team, score, away team, margin. Where
both sides are present and belong to different clubs, the row links to
`/head-to-head?a=<homeClubKey>&b=<awayClubKey>`.

- [ ] **Step 5: Verify**

Run: `vp check && vp test`, then `vp dev` and page through a full grade, confirm
no fixture appears twice, and confirm the head-to-head links land on a populated
page.

- [ ] **Step 6: Commit**

```bash
git add src/db/queries/results.ts src/db/queries/results.test.ts src/routes/results.tsx src/components/results/
git commit -m "feat: results fixture list"
```

---

### Task 5: Club profile links to top opponents

**Files:**

- Modify: `src/db/queries/games.ts`
- Modify: `src/db/queries/club-profile.ts`
- Modify: `src/components/club/club-profile-page.tsx`

**Interfaces:**

- Produces: `fetchTopOpponents(db, clubKey, limit)` returning
  `readonly { club: Club; played: number }[]`, ordered by `played` descending
  then club name ascending.

- [ ] **Step 1: Write the failing test**

```ts
// src/db/queries/head-to-head.test.ts — append
describe('topOpponents', () => {
    it('orders by games played then name, so ties are stable', () => {
        expect(
            topOpponents([
                { clubKey: 'b', name: 'Bravo', played: 3 },
                { clubKey: 'c', name: 'Charlie', played: 9 },
                { clubKey: 'a', name: 'Alpha', played: 3 },
            ]),
        ).toEqual([
            { clubKey: 'c', name: 'Charlie', played: 9 },
            { clubKey: 'a', name: 'Alpha', played: 3 },
            { clubKey: 'b', name: 'Bravo', played: 3 },
        ]);
    });

    it('is empty for a club with no games', () => {
        expect(topOpponents([])).toEqual([]);
    });
});
```

- [ ] **Step 2: Run it, watch it fail, implement, watch it pass**

Run: `vp test src/db/queries/head-to-head.test.ts`
Expected: FAIL then PASS.

- [ ] **Step 3: Render the links**

Add a `Panel` to the club profile listing the top five opponents, each linking to
`/head-to-head?a=<thisClub>&b=<opponent>`. Render nothing at all when the list is
empty — a club with no fixture data should not get an empty box.

- [ ] **Step 4: Verify**

Run: `vp check && vp test`, then check a club profile in `vp dev`.

- [ ] **Step 5: Commit**

```bash
git add -A src/db/queries src/components/club
git commit -m "feat: link club profiles to head to head"
```

---

### Task 6: Remove the stale "not available" copy

**Files:**

- Modify: `src/components/method/method-page.tsx`
- Modify: any nav or copy asserting fixtures are unavailable

- [ ] **Step 1: Find the claims**

```bash
grep -rn "not imported\|ladders only\|no scoreline\|NotAvailable" src/
```

- [ ] **Step 2: Update them**

The method page should now state that fixture-level results cover 2025–2026 only,
and that ladder-derived figures remain the basis for everything earlier. Leaving
"we have no fixtures" copy in place while shipping a fixtures page would make the
site contradict itself.

- [ ] **Step 3: Verify**

Run: `vp check && vp test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "docs: method page covers fixture-level coverage"
```

---

## Self-Review Notes

Covers spec §2 (aggregator), §3 (head-to-head page), §4 (results page), and the
head-to-head half of §5 (picker toggle, Task 3 Step 1). The §6 tables here are
built directly on `DataTable` rather than converted, since they are new. The
coverage caveat in Task 6 exists because the spec narrowed ingestion to 2025–2026
after the pages were designed — a head-to-head record is therefore _not_ a
complete historical record, and the page must not imply otherwise.
