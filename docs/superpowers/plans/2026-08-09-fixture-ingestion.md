# PlayHQ Fixture Ingestion Implementation Plan

> **STATUS: COMPLETE (as of 2026-08-12).** All 8 tasks; 7 and 8 merged,
> because the fetch has no senior/junior filter and juniors arrived in the
> same pass. Commits `0100ff7`..`1df8718`.
>
> The Self-Review Notes at the foot of this plan predate two decisions taken
> during implementation and are stale on both counts:
>
> - `games.is_finals` exists. Ladders are regular-season only, so finals must
>   be separable to reconcile against them.
> - Teams resolve season-wide by `playhq_id`, never via the club's own grade.
>   Junior grading rounds put a team in fixtures outside its final grade, and
>   joining team→grade misattributes roughly 8% of games.
>
> `docs/playhq-api.md` §6 is the accurate record of what was learned.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a `games` table holding real match results for the 2025 and 2026 seasons, so head-to-head and results pages have something true to show.

**Architecture:** Extends the existing two-stage pipeline unchanged in shape — stage 1 (`src/pipeline/fetch`) hits PlayHQ's public GraphQL API and writes CSV; stage 2 (`src/pipeline/import`) validates CSV and generates SQL for D1. The response→row mapping is a pure function fixture-tested against committed raw captures, exactly like `src/pipeline/fetch/ladder.ts`.

**Tech Stack:** Node scripts under `src/pipeline`, drizzle-kit migrations, D1 via wrangler, vitest.

## Global Constraints

- Validate with `vp check` and `vp test`. Never invoke `npm`/`vitest` directly.
- **Scope is the 2025 and 2026 seasons only.** Senior grades first; juniors only after seniors are proven end to end (Task 8).
- Rate limit stays at the existing `RATE_LIMIT_MS = 1200` in `playhq-client.ts`. Do not raise it.
- Query strings are copied **verbatim** from `docs/playhq-api.md` into `QUERIES` in `playhq-client.ts` and never hand-edited there.
- Raw API captures are committed under `data/raw/probe/` and used as test fixtures.
- Fixture CSVs are split per season: `data/games-2025.csv`, `data/games-2026.csv`.
- An unresolvable team id is a **hard import failure**, never a silently invented team — matching the existing rule in `src/pipeline/import/validate.ts`.
- Forfeits count as results; byes, no-results and unplayed games do not.
- No bitwise operators (existing lint rule).
- Branch is `feature/head-to-head`. Commit after every task.

## File Structure

| File                                           | Responsibility                                           |
| ---------------------------------------------- | -------------------------------------------------------- |
| `docs/playhq-api.md` (modify)                  | §6 documenting the fixtures operation, verified by curl. |
| `data/raw/probe/gradeFixture_*.json` (create)  | Committed raw captures, doubling as test fixtures.       |
| `src/db/schema.ts` (modify)                    | `games` table, relations, inferred types.                |
| `drizzle/0006_games.sql` (generated)           | Migration.                                               |
| `src/pipeline/fetch/games.ts` (create)         | Pure response→CSV-row mapping.                           |
| `src/pipeline/fetch/games.test.ts` (create)    | Fixture-driven mapping tests.                            |
| `src/pipeline/fetch/playhq-client.ts` (modify) | Adds the fixtures query to `QUERIES`.                    |
| `src/pipeline/fetch/run.ts` (modify)           | Walks grades for games, writes per-season CSVs.          |
| `src/pipeline/import/types.ts` (modify)        | `GameImportRow`, `ImportData.games`.                     |
| `src/pipeline/import/parse.ts` (modify)        | `parseGameRow`.                                          |
| `src/pipeline/import/validate.ts` (modify)     | Team-id resolution and status checks.                    |
| `src/pipeline/import/generate-sql.ts` (modify) | `games` INSERT generation.                               |

---

### Task 1: Discover and document the fixtures query — **GATE**

**Files:**

- Modify: `docs/playhq-api.md`
- Create: `data/raw/probe/gradeFixture_premier_2026_a95c2301.json`

**Interfaces:**

- Produces: a documented GraphQL operation name, its variables, its pagination
  behaviour, and a field-by-field mapping onto the `games` columns in
  `docs/superpowers/specs/2026-08-09-head-to-head-design.md` §1. Every later task
  depends on this.

This task is exploratory, not test-driven — there is nothing to test until the
shape is known. **It is a gate: if the operation requires authentication, stop
and report rather than proceeding to Task 2.**

- [ ] **Step 1: Fetch PlayHQ's web bundle**

```bash
curl -s -H 'User-Agent: Mozilla/5.0' https://www.playhq.com/ \
  | grep -o 'assets/index\.[a-z0-9]*\.js' | head -1
```

Then fetch that asset to `/tmp/playhq-bundle.js`. This is the same technique
recorded in `docs/playhq-api.md`'s preamble — introspection is disabled, so the
queries have to come out of the client.

- [ ] **Step 2: Grep for the fixtures operation**

```bash
grep -o 'query [a-zA-Z]*\(Fixture\|Game\|Schedule\|Round\)[a-zA-Z]*[^`]*' /tmp/playhq-bundle.js | head -20
```

Widen with `grep -o 'query [a-zA-Z]*[^`]\{0,400\}' | grep -i 'fixture\|game'`
if nothing lands. Record every candidate operation name.

- [ ] **Step 3: Verify with curl against a known grade**

Use grade `a95c2301` (Premier Division 2026, from `docs/playhq-api.md` §4) and
the exact headers §1 requires — `Content-Type`, `tenant: netball-australia`,
`Origin: https://www.playhq.com`, and the project `User-Agent`. Omitting
`Origin` yields a bodiless 404 that reads like "no such operation", so a
failure here must be re-tested with the header before being believed.

Save the response to `data/raw/probe/gradeFixture_premier_2026_a95c2301.json`.

- [ ] **Step 4: Answer these questions explicitly in the doc**

Append a §6 to `docs/playhq-api.md` covering:

- Operation name, variables, and the verbatim query string.
- Whether results are paginated (look for `limit`/`after`/`cursor` arguments) and
  how many games came back for a grade whose round count is known.
- Which field carries the score, and whether an unplayed game returns `null`
  scores or zeros — this determines how `status` is derived.
- How forfeits are represented (a status enum? a flag? a 0–20 scoreline?).
- How byes appear: a game with one team, a null team, or absent entirely.
- Whether team objects carry the same `id` used by `gradeLadder` (they must, or
  the whole join to `teams.playhqId` fails).

- [ ] **Step 5: Gate check**

If the operation needs an `Authorization` header, a session cookie, or a
persisted-query hash, **stop**. Record the finding in §6 and report back — the
remaining tasks assume public access and would need rethinking.

- [ ] **Step 6: Commit**

```bash
git add docs/playhq-api.md data/raw/probe/gradeFixture_premier_2026_a95c2301.json
git commit -m "docs: playhq fixtures query discovery"
```

---

### Task 2: `games` table schema and migration

**Files:**

- Modify: `src/db/schema.ts`
- Generate: `drizzle/0006_games.sql`

**Interfaces:**

- Produces: `games` table export, `gamesRelations`, and types `Game` /
  `NewGame`; constants `GAME_STATUSES` and `FORFEIT_SIDES`.

- [ ] **Step 1: Add the table**

Append to `src/db/schema.ts`, after `teamSeasonResults`:

```ts
export const GAME_STATUSES = [
    'final',
    'forfeit',
    'no_result',
    'bye',
    'scheduled',
] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const FORFEIT_SIDES = ['home', 'away'] as const;
export type ForfeitSide = (typeof FORFEIT_SIDES)[number];

/**
 * One row per fixture. Hangs off `grades`, not `seasons`: a grade already
 * carries its season, tier and division, so every season/grade/band filter the
 * site already has applies to games through a single join.
 *
 * `status` is stored rather than derived so the "forfeits count as results"
 * decision can be revisited without a re-scrape. Team ids are nullable because
 * a bye has only one side.
 */
export const games = sqliteTable(
    'games',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        gradeId: integer('grade_id')
            .notNull()
            .references(() => grades.id, { onDelete: 'cascade' }),
        playhqId: text('playhq_id').notNull(),
        round: integer('round'),
        roundName: text('round_name'),
        /** Epoch seconds, null when PlayHQ has no scheduled time. */
        playedAt: integer('played_at'),
        homeTeamId: integer('home_team_id').references(() => teams.id, {
            onDelete: 'cascade',
        }),
        awayTeamId: integer('away_team_id').references(() => teams.id, {
            onDelete: 'cascade',
        }),
        homeScore: integer('home_score'),
        awayScore: integer('away_score'),
        status: text('status').notNull().$type<GameStatus>(),
        forfeitingSide: text('forfeiting_side').$type<ForfeitSide>(),
        source: text('source').notNull().$type<Source>(),
        scrapedAt: integer('scraped_at'),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(current_timestamp)`),
    },
    (t) => [
        /** Identity is (grade, playhq id) — the same rule `teams` uses. */
        uniqueIndex('games_grade_playhq_idx').on(t.gradeId, t.playhqId),
        index('games_grade_idx').on(t.gradeId),
        index('games_home_team_idx').on(t.homeTeamId),
        index('games_away_team_idx').on(t.awayTeamId),
    ],
);

export const gamesRelations = relations(games, ({ one }) => ({
    grade: one(grades, { fields: [games.gradeId], references: [grades.id] }),
    homeTeam: one(teams, {
        fields: [games.homeTeamId],
        references: [teams.id],
        relationName: 'homeTeam',
    }),
    awayTeam: one(teams, {
        fields: [games.awayTeamId],
        references: [teams.id],
        relationName: 'awayTeam',
    }),
}));

export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
```

Also add `games: many(games)` to `gradesRelations`.

- [ ] **Step 2: Generate the migration**

```bash
vp run db:generate
```

Expected: a new `drizzle/0006_*.sql` creating `games` and its four indexes.
Read it and confirm it contains no `DROP` of an existing table.

- [ ] **Step 3: Apply locally**

```bash
vp run db:migrate:local
```

Expected: applied cleanly.

- [ ] **Step 4: Verify types compile**

Run: `vp check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: games table for fixture-level results"
```

---

### Task 3: Pure fixture→row mapping

**Files:**

- Create: `src/pipeline/fetch/games.ts`
- Test: `src/pipeline/fetch/games.test.ts`

**Interfaces:**

- Consumes: the response shape documented in Task 1; `CsvValue` from
  `@/pipeline/csv`.
- Produces:

    ```ts
    type GameRow = Record<string, CsvValue> & {
        grade_key: string;
        playhq_id: string;
        round: number | null;
        round_name: string | null;
        played_at: number | null;
        home_playhq_id: string | null;
        away_playhq_id: string | null;
        home_score: number | null;
        away_score: number | null;
        status: string;
        forfeiting_side: string | null;
        source: 'playhq';
        scraped_at: number;
    };
    classifyGame(fixture: Fixture): { status: GameStatus; forfeitingSide: ForfeitSide | null }
    toGameRows(fixtures, gradeKey, scrapedAt): readonly GameRow[]
    ```

    Rows carry PlayHQ team ids, not club keys — stage 2 resolves them against
    `teams.playhq_id`, which is where the existing team identity rule lives.

- [ ] **Step 1: Write the failing test**

Drive every case off the committed capture from Task 1 plus hand-built minimal
objects for the cases the capture does not contain. Adjust field names to match
what §6 actually documents.

```ts
// src/pipeline/fetch/games.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyGame, toGameRows } from '@/pipeline/fetch/games';

const capture = JSON.parse(
    readFileSync(
        'data/raw/probe/gradeFixture_premier_2026_a95c2301.json',
        'utf8',
    ),
) as { data: { discoverGrade: { fixture: unknown[] } } };

describe('classifyGame', () => {
    it('is final when both scores are present', () => {
        expect(
            classifyGame({ homeScore: 45, awayScore: 32, forfeit: null }),
        ).toEqual({ status: 'final', forfeitingSide: null });
    });

    it('records which side forfeited', () => {
        expect(
            classifyGame({ homeScore: 0, awayScore: 20, forfeit: 'HOME' }),
        ).toEqual({ status: 'forfeit', forfeitingSide: 'home' });
    });

    it('is a bye when one side is absent', () => {
        expect(
            classifyGame({ homeScore: null, awayScore: null, awayTeam: null }),
        ).toEqual({ status: 'bye', forfeitingSide: null });
    });

    it('is scheduled when the game is in the future with no scores', () => {
        expect(
            classifyGame({
                homeScore: null,
                awayScore: null,
                status: 'UPCOMING',
            }),
        ).toEqual({ status: 'scheduled', forfeitingSide: null });
    });

    it('is no_result when a played game has no scores', () => {
        expect(
            classifyGame({ homeScore: null, awayScore: null, status: 'FINAL' }),
        ).toEqual({ status: 'no_result', forfeitingSide: null });
    });
});

describe('toGameRows', () => {
    it('maps the committed capture without losing games', () => {
        const rows = toGameRows(
            capture.data.discoverGrade.fixture,
            'premier-2026',
            1_770_000_000,
        );
        expect(rows.length).toBe(capture.data.discoverGrade.fixture.length);
        expect(rows[0].grade_key).toBe('premier-2026');
        expect(rows[0].source).toBe('playhq');
    });

    it('carries playhq team ids through untouched', () => {
        const rows = toGameRows(
            capture.data.discoverGrade.fixture,
            'premier-2026',
            1,
        );
        const played = rows.filter((row) => row.status === 'final');
        expect(played.every((row) => row.home_playhq_id !== null)).toBe(true);
        expect(played.every((row) => row.away_playhq_id !== null)).toBe(true);
    });

    it('never emits two rows with the same playhq id', () => {
        const rows = toGameRows(
            capture.data.discoverGrade.fixture,
            'premier-2026',
            1,
        );
        expect(new Set(rows.map((row) => row.playhq_id)).size).toBe(
            rows.length,
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/pipeline/fetch/games.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the mapping**

Write `src/pipeline/fetch/games.ts` mirroring `ladder.ts`'s structure: exported
response types, a `classifyGame` that derives status in the order
bye → forfeit → both-scores-present → scheduled → no_result, and `toGameRows`
mapping to snake_case CSV rows. Keep it pure — no `fetch`, no `fs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/pipeline/fetch/games.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/fetch/games.ts src/pipeline/fetch/games.test.ts
git commit -m "feat: map playhq fixtures to game rows"
```

---

### Task 4: Fetch wiring and per-season CSV output

**Files:**

- Modify: `src/pipeline/fetch/playhq-client.ts`
- Modify: `src/pipeline/fetch/run.ts`

**Interfaces:**

- Consumes: `toGameRows` (Task 3).
- Produces: `data/games-2025.csv` and `data/games-2026.csv`; a
  `--games` flag on the fetch runner.

- [ ] **Step 1: Add the query**

Add the verbatim query string from `docs/playhq-api.md` §6 to `QUERIES` in
`playhq-client.ts` under its documented operation name. Do not reformat it.

- [ ] **Step 2: Walk grades for games**

In `run.ts`, reuse the existing season→grade walk. For each grade in the target
seasons, call the fixtures operation through the existing cache-first client, map
with `toGameRows(fixtures, gradeKey, scrapedAt)`, and accumulate rows keyed by
season start year.

Add a `--games` flag so the games fetch can run without re-fetching ladders, and
a `--year=<n>` filter so 2025 and 2026 can be run separately. Caching is already
cache-first by operation+id, so a re-run costs nothing on already-fetched grades.

- [ ] **Step 3: Write one CSV per season**

Use the existing `toCsv` from `@/pipeline/csv` and write
`data/games-${String(year)}.csv`. Sort rows by `(grade_key, round, playhq_id)`
before writing, so a re-run produces a byte-identical file and the git diff shows
real changes rather than reordering.

- [ ] **Step 4: Run against one grade end to end**

```bash
vp run fetch -- --games --year=2026 --grade=a95c2301
```

Expected: `data/games-2026.csv` exists with a header row plus one row per fixture,
statuses populated, no empty `playhq_id`.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/fetch/playhq-client.ts src/pipeline/fetch/run.ts data/games-2026.csv
git commit -m "feat: fetch playhq fixtures into per-season csvs"
```

---

### Task 5: Import parsing and validation

**Files:**

- Modify: `src/pipeline/import/types.ts`
- Modify: `src/pipeline/import/parse.ts`
- Modify: `src/pipeline/import/validate.ts`
- Create: `src/pipeline/import/__fixtures__/games/` (csv set)
- Test: `src/pipeline/import/validate.test.ts` (append)

**Interfaces:**

- Produces: `GameImportRow`; `ImportData.games: GameImportRow[]`;
  `parseGameRow(raw: RawRow): GameImportRow`.

- [ ] **Step 1: Add the type**

```ts
// src/pipeline/import/types.ts
export type GameImportRow = {
    gradeKey: string;
    playhqId: string;
    round: number | null;
    roundName: string | null;
    playedAt: number | null;
    /** PlayHQ team ids, resolved against `teams.playhq_id` at validation. */
    homePlayhqId: string | null;
    awayPlayhqId: string | null;
    homeScore: number | null;
    awayScore: number | null;
    status: string;
    forfeitingSide: string | null;
    source: string;
    scrapedAt: number | null;
};
```

Add `games: GameImportRow[]` to `ImportData`.

- [ ] **Step 2: Write the failing validation tests**

```ts
// src/pipeline/import/validate.test.ts — append
describe('game validation', () => {
    it('fails loudly on a team id that is not in teams.csv', () => {
        expect(() =>
            validateGames(
                [
                    {
                        gradeKey: 'premier-2026',
                        playhqId: 'g1',
                        round: 1,
                        roundName: 'Round 1',
                        playedAt: null,
                        homePlayhqId: 'ghost',
                        awayPlayhqId: 't2',
                        homeScore: 40,
                        awayScore: 30,
                        status: 'final',
                        forfeitingSide: null,
                        source: 'playhq',
                        scrapedAt: 1,
                    },
                ],
                new Map([['premier-2026:t2', 2]]),
            ),
        ).toThrow(ImportValidationError);
    });

    it('rejects an unknown status', () => {
        expect(() =>
            validateGames(
                [{ /* ...as above but */ status: 'abandoned-ish' }],
                new Map(),
            ),
        ).toThrow(/status/u);
    });

    it('rejects a final game missing a score', () => {
        // A final with no score is a no_result; letting it through would put a
        // phantom 0-0 into every head-to-head record.
        expect(() =>
            validateGames(
                [{/* status: 'final', homeScore: null */}],
                new Map(),
            ),
        ).toThrow(/score/u);
    });

    it('allows a bye with one empty side', () => {
        expect(() =>
            validateGames(
                [{/* status: 'bye', awayPlayhqId: null, scores null */}],
                new Map([['premier-2026:t1', 1]]),
            ),
        ).not.toThrow();
    });

    it('rejects a game whose two sides are the same team', () => {
        expect(() =>
            validateGames([{/* home and away both 't1' */}], new Map()),
        ).toThrow(/same team/u);
    });
});
```

Fill each elided object with the full literal from the first test, varying only
the noted fields — do not use a shared mutable helper, so a failing test names
exactly the row that broke.

- [ ] **Step 3: Run it, watch it fail**

Run: `vp test src/pipeline/import/validate.test.ts`
Expected: FAIL — `validateGames` not exported.

- [ ] **Step 4: Implement `validateGames`**

Team resolution is keyed `${gradeKey}:${playhqId}` because team identity is
grade-scoped (see the comment on `teams_grade_playhq_idx` in `schema.ts`).
Throw `ImportValidationError` with the file and line for: unknown team id,
unknown status, `final`/`forfeit` with a missing score, non-null scores on a
`bye`, and home equal to away.

- [ ] **Step 5: Run tests to verify they pass**

Run: `vp test src/pipeline/import/validate.test.ts`
Expected: PASS.

- [ ] **Step 6: Add a fixture directory and smoke test**

Create `src/pipeline/import/__fixtures__/games/` mirroring the `basic` fixture
(`seasons.csv`, `clubs.csv`, `club_aliases.csv`, `grades.csv`, `teams.csv`,
`team_season_results.csv`) plus a `games-2026.csv` with four rows: a final, a
forfeit, a bye and a no-result. Extend the existing import smoke test to run the
full CSV→SQL→sqlite path over it and assert four rows land in `games` with the
expected statuses.

- [ ] **Step 7: Commit**

```bash
git add -A src/pipeline/import
git commit -m "feat: validate and import game rows"
```

---

### Task 6: SQL generation

**Files:**

- Modify: `src/pipeline/import/generate-sql.ts`
- Modify: `src/pipeline/import/executors.ts` (if the table list is enumerated there)

**Interfaces:**

- Consumes: `GameImportRow`, the team-id map from Task 5.
- Produces: `games` INSERT statements in the generated batch.

- [ ] **Step 1: Follow the existing pattern**

Run `grep -n "team_season_results" src/pipeline/import/generate-sql.ts` and mirror
it exactly for `games` — same batching size, same escaping helpers from
`sql-format.ts`, same delete-then-insert ordering. `games` must be inserted after
`teams`, since it references them.

- [ ] **Step 2: Extend the smoke test assertion**

The Task 5 fixture test already exercises this path; add an assertion that a
re-run of the import is idempotent (row count unchanged, no unique-index error).

- [ ] **Step 3: Run**

Run: `vp test src/pipeline/import`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pipeline/import
git commit -m "feat: generate games insert sql"
```

---

### Task 7: Senior-grade backfill for 2025 and 2026

**Files:**

- Create: `data/games-2025.csv`, `data/games-2026.csv` (full senior data)

- [ ] **Step 1: Fetch 2026 seniors**

```bash
vp run fetch -- --games --year=2026
```

Expected: runs at ~1 req/sec, resumable, cache-first. Watch for any grade that
errors and record it rather than retrying blindly.

- [ ] **Step 2: Fetch 2025 seniors**

```bash
vp run fetch -- --games --year=2025
```

- [ ] **Step 3: Sanity-check the output before importing**

For a grade whose ladder is already in the database, confirm the games agree with
it: sum each team's wins from `games` and compare with `team_season_results.won`.
A mismatch here means the mapping is wrong, and it is far cheaper to find now than
after the head-to-head page is live.

```bash
vp run check-games -- --year=2026 --grade=premier-2026
```

Write this as a small script if it does not exist; it is worth the ten minutes.
Expect a handful of legitimate mismatches — `PlayedMismatchWarning` in
`import/types.ts` documents that PlayHQ's own ladder data is internally
inconsistent for a small fraction of rows. Investigate anything systematic.

- [ ] **Step 4: Import locally and spot-check**

```bash
vp run import -- --local
wrangler d1 execute netball-stats --local --command \
  "select status, count(*) from games group by status"
```

Expected: `final` dominates, a small `forfeit` count, `bye` present, no
`scheduled` rows for 2025 (a completed season).

- [ ] **Step 5: Commit**

```bash
git add data/games-2025.csv data/games-2026.csv
git commit -m "data: backfill senior fixtures for 2025 and 2026"
```

---

### Task 8: Junior grades

**Files:**

- Modify: `data/games-2025.csv`, `data/games-2026.csv`

- [ ] **Step 1: Extend the grade filter to juniors**

Only after Task 7 is verified. Re-run the fetch without the senior filter; the
cache means senior grades are not re-fetched.

- [ ] **Step 2: Re-run the ladder cross-check**

Same script as Task 7 Step 3, across all grades. Junior grades are where naming
collisions live (`Walkerville 1` / `2`), so confirm that teams within a club
resolve to distinct `teams.id` values and that intra-club games exist and are
correctly attributed to two different teams of the same club.

- [ ] **Step 3: Confirm row counts are plausible**

```bash
wrangler d1 execute netball-stats --local --command \
  "select g.tier, count(*) from games j join grades g on g.id = j.grade_id group by g.tier"
```

Expected: counts roughly proportional to grade counts per tier. A tier with zero
games means its grades were skipped.

- [ ] **Step 4: Commit**

```bash
git add data/games-2025.csv data/games-2026.csv
git commit -m "data: backfill junior fixtures for 2025 and 2026"
```

---

## Self-Review Notes

Covers spec §1 (schema, fetch, import) in full, at the narrowed scope of 2025–2026
agreed after the spec was written — the spec's "all PlayHQ-era seasons" line was
superseded by that decision and later seasons are a follow-up run of Task 7 with a
different `--year`. Spec §2/§3/§4 (queries and pages) are in the head-to-head
plan. Task 1 is a genuine gate: no later task can be written more precisely until
the response shape is known, which is why Task 3's field names are marked to be
adjusted against §6.
