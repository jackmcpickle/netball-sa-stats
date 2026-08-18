# Data-backed FAQ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static Home FAQ with season-specific answers, add per-club Q&A on each profile, and add a footer-only `/faq` page whose site-wide answers are built from D1.

**Architecture:** Three pure builders (`buildHomeFaq`, `buildClubFaq`, `buildSiteFaq`) turn existing page DTOs into the same `FaqEntry[]` already consumed by `FaqSection`, `faqSchema()`, and markdown `faqBlock`. A `Championship.leader()` method and `GamesRepo.earliestYear()` supply facts the current DTOs do not expose. `/faq` is a thin new route + service; Home and club pages grow a field or a section, not a new data path.

**Tech Stack:** TanStack Start + Router, Drizzle on D1, Vitest, existing `FaqEntry` / `FaqSection` / JSON-LD helpers. Validate with `vp test` and `vp check` only.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-data-backed-faq-design.md`
- Validate with `vp check` and `vp test`. Never invoke `npm`/`vitest` directly.
- Object literals use sorted keys (repo-wide `sort-keys`).
- String literals in JSX are wrapped in braces: `{'FAQ'}`.
- Tokens only: `text-ink`, `text-ink-body`, `text-ink-muted`, `bg-paper`, `border-rule`.
- Same `FaqEntry[]` on the page, in FAQPage JSON-LD, and in the markdown twin. Never emit `faqSchema([])`.
- Omit a question when its fact is missing. Do not guess.
- No question text is reused across `/`, `/faq`, `/clubs/$clubKey`, and `/method`.
- `METHOD_FAQ` stays a static export. Delete `HOME_FAQ` only in Task 7, after every caller is switched.
- `/faq` cache: `public, max-age=604800`. Other HTML pages get no new cache header. Markdown twins stay `public, max-age=300` except `/faq`.
- No KV, no FAQ table, no cache purge on import.
- Commit after every task.

## File Structure

| File                                        | Responsibility                                  |
| ------------------------------------------- | ----------------------------------------------- |
| `src/server/domain/championship.ts`         | `leader()` on the unsorted season               |
| `src/server/repos/games.repo.ts`            | `earliestYear()`                                |
| `src/server/dto/rankings.dto.ts`            | `ChampionshipLeader` + `leader` on the page DTO |
| `src/seo/faq.ts`                            | Builders + `METHOD_FAQ`                         |
| `src/seo/faq.test.ts`                       | Builder tests                                   |
| `src/seo/cache-control.ts`                  | Cache-Control values by path                    |
| `src/server/dto/faq.dto.ts`                 | `FaqPageDto`                                    |
| `src/server/services/faq.service.ts`        | `/faq` loader data                              |
| `src/server/container.ts`                   | Wire `faq`                                      |
| `src/routes/faq.tsx`                        | `/faq` route                                    |
| `src/components/faq/faq-page.tsx`           | `/faq` page                                     |
| `src/start.ts`                              | Week-long cache on `/faq`                       |
| `src/components/site-footer.tsx`            | Footer FAQ link                                 |
| `src/routes/index.tsx`                      | Home `head()` from loader + `buildHomeFaq`      |
| `src/components/rankings/rankings-page.tsx` | Home `FaqSection` from builder                  |
| `src/routes/clubs.$clubKey.tsx`             | Club FAQ schema                                 |
| `src/components/club/club-profile-page.tsx` | Club `FaqSection`                               |
| `src/seo/markdown/pages.ts`                 | `renderFaq` + Home/club FAQ blocks              |
| `src/seo/markdown/resolve.ts`               | `/faq` twin                                     |
| `src/seo/sitemap.ts`                        | `/faq` entry                                    |
| `src/seo/agent-files.ts`                    | `llms.txt` FAQ line                             |

---

### Task 1: `Championship.leader()`

**Files:**

- Modify: `src/server/domain/championship.ts`
- Test: `src/server/domain/championship.test.ts`

**Interfaces:**

- Consumes: existing `Championship` + `ChampionshipRow`
- Produces: `Championship.leader(): ChampionshipRow | null` — the row with `rank === 1` on the unsorted season, or `null` when none

- [ ] **Step 1: Write the failing tests**

Add a new `describe` at the bottom of `src/server/domain/championship.test.ts`:

```ts
describe('Championship.leader', () => {
    it('returns the rank-1 row even when it is not first in the array', () => {
        // SAFETY: leader() reads only `rank`; these literals supply it.
        const rows = [
            { club: { key: 'b', name: 'B' }, points: 8, rank: 2, teams: 4 },
            { club: { key: 'a', name: 'A' }, points: 10, rank: 1, teams: 5 },
        ] as ChampionshipRow[];
        const result = Championship.fromHistory(historyOf(2024, rows), 2024);
        if (!result.ok) {
            throw new Error('expected ok');
        }
        expect(result.value.leader()?.club.key).toBe('a');
    });

    it('is null when the season has no rows', () => {
        const result = Championship.fromHistory(historyOf(2024, []), 2024);
        if (!result.ok) {
            throw new Error('expected ok');
        }
        expect(result.value.leader()).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vp test src/server/domain/championship.test.ts`

Expected: FAIL — `leader` is not a function

- [ ] **Step 3: Implement `leader()`**

Add this method to `Championship` in `src/server/domain/championship.ts`, after `previousYear`:

```ts
    /**
     * Rank 1 on the unsorted season. Table sort and page must not change
     * this: Home FAQ names the championship leader, not the first visible
     * row.
     */
    public leader(): ChampionshipRow | null {
        return this.rowsData.find((row) => row.rank === 1) ?? null;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vp test src/server/domain/championship.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/domain/championship.ts src/server/domain/championship.test.ts
git commit -m "$(cat <<'EOF'
feat: expose championship leader from the unsorted season

EOF
)"
```

---

### Task 2: `GamesRepo.earliestYear()`

**Files:**

- Modify: `src/server/repos/games.repo.ts`
- Test: `src/server/repos/games.repo.test.ts`

**Interfaces:**

- Consumes: existing `games` / `grades` / `seasons` joins
- Produces: `GamesRepo.earliestYear(): Promise<number | null>` — earliest `seasons.startYear` that has at least one `games` row, or `null`

- [ ] **Step 1: Write the failing tests**

Append to `src/server/repos/games.repo.test.ts` (the file already has `setup()`, `baseSpec()`, and `seedGames`):

```ts
describe('GamesRepo.earliestYear', () => {
    it('is the earliest season year that has a game', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            {
                away: 'garville',
                awayScore: 30,
                gradeKey: 'amnd-2026-a1',
                home: 'contax',
                homeScore: 40,
                round: 1,
            },
            {
                away: 'garville',
                awayScore: 32,
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                homeScore: 41,
                round: 1,
            },
        ]);
        expect(await createGamesRepo(db).earliestYear()).toBe(2025);
    });

    it('is null when there are no games', async () => {
        const { db } = await setup();
        expect(await createGamesRepo(db).earliestYear()).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vp test src/server/repos/games.repo.test.ts`

Expected: FAIL — `earliestYear` is not a function

- [ ] **Step 3: Implement `earliestYear()`**

In `src/server/repos/games.repo.ts`:

1. Add a query function above `createGamesRepo`:

```ts
export async function fetchEarliestGameYear(db: Db): Promise<number | null> {
    const [row] = await db
        .select({
            year: sql<number | null>`min(${seasons.startYear})`,
        })
        .from(games)
        .innerJoin(grades, eq(grades.id, games.gradeId))
        .innerJoin(seasons, eq(seasons.id, grades.seasonId));
    return row?.year ?? null;
}
```

2. Add `earliestYear` to the `GamesRepo` interface (keep keys sorted: `countForGrade`, `earliestYear`, `factsForPair`, `opponentCounts`, `pageForGrade`).

3. Add the method to `createGamesRepo`, sorted the same way:

```ts
        async earliestYear(): Promise<number | null> {
            return await fetchEarliestGameYear(db);
        },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vp test src/server/repos/games.repo.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/repos/games.repo.ts src/server/repos/games.repo.test.ts
git commit -m "$(cat <<'EOF'
feat: query the earliest year that has fixture rows

EOF
)"
```

---

### Task 3: Rankings DTO `leader` field

**Files:**

- Modify: `src/server/dto/rankings.dto.ts`
- Modify: `src/server/services/rankings.service.ts`
- Test: `src/server/services/rankings.service.test.ts`

**Interfaces:**

- Consumes: `Championship.leader()` from Task 1
- Produces:

```ts
export interface ChampionshipLeader {
    readonly club: Club;
    readonly points: number;
    readonly teams: number;
}

// added to RankingsPageDto
readonly leader: ChampionshipLeader | null;
```

Filled from `championship.value.leader()` **before** `sorted()`.

- [ ] **Step 1: Write the failing test**

Add to `describe('rankings service'` in `src/server/services/rankings.service.test.ts`:

```ts
it('names the rank-1 club as leader when the table is sorted by name', async () => {
    const db = createTestDb();
    await seed(db, baseSpec());

    const result = unwrap(
        await createServices(db).rankings.getPage({
            dir: 'asc',
            season: 2024,
            sort: 'club',
        }),
    );

    expect(result.season.rows[0]?.club.key).toBe('ajax');
    expect(result.leader?.club.key).toBe('contax');
    expect(result.leader?.points).toBeGreaterThan(0);
});
```

`baseSpec()` 2024 A1: Contax 1st, Garville 2nd, Ajax 3rd. Club-name ascending puts Ajax first.

- [ ] **Step 2: Run the test to verify it fails**

Run: `vp test src/server/services/rankings.service.test.ts`

Expected: FAIL — `leader` is undefined

- [ ] **Step 3: Add the type and fill it**

In `src/server/dto/rankings.dto.ts`, add `ChampionshipLeader` next to `ChampionshipRow` (import `Club` is already available via `shared.dto`). Add `readonly leader: ChampionshipLeader | null` to `RankingsPageDto` (keep DTO keys sorted: `clubCount`, `coverage`, `gradeCount`, `leader`, `previousYear`, `season`, `series`, `tableState`, `totalRows`, `worstRank`).

In `src/server/services/rankings.service.ts`:

1. Import `isNull` from `es-toolkit` (file already imports `isUndefined`).
2. After `championship` succeeds and **before** `sorted()`, read the leader.
3. Include `leader` in the `ok({...})` object.

```ts
const leaderRow = championship.value.leader();
const paged = championship.value.sorted(
    TableQuery.from(
        {
            dir: params.dir,
            page: params.page,
            pageSize: params.pageSize,
            sort: params.sort,
        },
        CHAMPIONSHIP_TABLE_SPEC,
    ),
);
// ... existing previousYear / Promise.all / worstRank ...

return ok({
    clubCount: clubs.length,
    coverage,
    gradeCount: gradesByYear.reduce(
        (total, grades) => total + grades.length,
        0,
    ),
    leader: isNull(leaderRow)
        ? null
        : {
              club: leaderRow.club,
              points: leaderRow.points,
              teams: leaderRow.teams,
          },
    previousYear,
    season: {
        coverageChanged:
            history.find((entry) => entry.year === resolvedYear)
                ?.coverageChanged ?? false,
        rows: paged.rows,
        year: resolvedYear,
    },
    series: rankSeries(history, 7),
    tableState: paged.state,
    totalRows: paged.totalRows,
    worstRank,
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vp test src/server/services/rankings.service.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/dto/rankings.dto.ts src/server/services/rankings.service.ts src/server/services/rankings.service.test.ts
git commit -m "$(cat <<'EOF'
feat: put the unsorted championship leader on the rankings DTO

EOF
)"
```

---

### Task 4: FAQ builders

**Files:**

- Modify: `src/seo/faq.ts`
- Create: `src/seo/faq.test.ts`

**Interfaces:**

- Consumes: `ChampionshipLeader` from Task 3; `Coverage` from `src/server/dto/shared.dto.ts`; `ordinal` from `src/seo/descriptions.ts`; existing `FaqEntry`
- Produces (keep `METHOD_FAQ` and the static `HOME_FAQ` export until Task 7):

```ts
export function buildHomeFaq(data: {
    readonly coverage: Coverage;
    readonly leader: ChampionshipLeader | null;
    readonly season: { readonly year: number };
    readonly totalRows: number;
}): readonly FaqEntry[];

export function buildClubFaq(data: {
    readonly profile: {
        readonly bestRank: number | null;
        readonly bestRankYear: number | null;
        readonly careerPoints: number;
        readonly club: { readonly name: string };
        readonly currentRank: number | null;
        readonly minorPremierships: number;
        readonly winPercentage: number | null;
    };
    readonly topOpponents: readonly {
        readonly club: { readonly name: string };
        readonly played: number;
    }[];
}): readonly FaqEntry[];

export function buildSiteFaq(data: {
    readonly coverage: Coverage;
    readonly fixtureFromYear: number | null;
    readonly latestRankedYear: number | null;
    readonly leader: ChampionshipLeader | null;
}): readonly FaqEntry[];
```

Question text (exact):

Home:

1. `Who is leading the {year} club championship?` — omit when `leader` is null
2. `How many clubs are in the {year} standings?`
3. `How many seasons are ranked, and is a season still in progress?`

Club:

1. `What is {name}'s latest championship rank?` — omit when `currentRank` is null
2. `What is {name}'s best championship finish?` — omit when `bestRank` or `bestRankYear` is null
3. `How many career championship points and minor premierships does {name} have?`
4. `What is {name}'s win rate since 2022?` — omit when `winPercentage` is null
5. `Who has {name} played most often since 2025?` — omit when `topOpponents` is empty

Site:

1. `What is the South Australian netball club championship?`
2. `Which competitions and seasons are covered?`
3. `How is a club championship score calculated?`
4. `What is the difference between championship score and club strength?`
5. `Where does the data come from?`
6. `Are in-progress seasons ranked?`
7. `How do I find a club's results?`

- [ ] **Step 1: Write the failing tests**

Create `src/seo/faq.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildClubFaq, buildHomeFaq, buildSiteFaq } from '@/seo/faq';
import type { ChampionshipLeader } from '@/server/dto/rankings.dto';
import type { Coverage } from '@/server/dto/shared.dto';

const leader: ChampionshipLeader = {
    club: {
        accent: 'pink',
        establishedYear: null,
        homeVenue: null,
        key: 'contax',
        name: 'Contax',
    },
    points: 12,
    teams: 8,
};

function coverageOf(input: {
    readonly competitions?: Coverage['competitions'];
    readonly rankedYears: readonly number[];
    readonly timelineGaps?: Coverage['timelineGaps'];
}): Coverage {
    return {
        changeNote: null,
        competitions: input.competitions ?? [
            {
                competition: {
                    key: 'amnd',
                    name: 'Adelaide Metropolitan Netball Division',
                    shortName: 'AMND',
                },
                seasons: [
                    { note: null, status: 'ranked', year: 2024 },
                    {
                        note: 'Season still being played, so it is not ranked yet.',
                        status: 'in-progress',
                        year: 2026,
                    },
                ],
            },
            {
                competition: {
                    key: 'premier_league',
                    name: 'Netball SA Premier League',
                    shortName: 'PL',
                },
                seasons: [
                    { note: null, status: 'absent', year: 2022 },
                    { note: null, status: 'ranked', year: 2024 },
                ],
            },
        ],
        isSampleData: false,
        methodologyBreak: null,
        rankedYears: input.rankedYears,
        timelineGaps: input.timelineGaps ?? [
            { afterYear: 2014, missingYears: [2015] },
        ],
        years: input.rankedYears,
    };
}

function questions(
    entries: readonly { readonly question: string }[],
): string[] {
    return entries.map((entry) => entry.question);
}

describe(buildHomeFaq, () => {
    const coverage = coverageOf({ rankedYears: [2024, 2025] });

    it('names the DTO leader, not whoever happens to be first in season.rows', () => {
        const entries = buildHomeFaq({
            coverage,
            leader,
            season: { year: 2024 },
            totalRows: 3,
        });
        const leading = entries.find((entry) =>
            entry.question.includes('leading'),
        );
        expect(leading?.answer).toContain('Contax');
        expect(leading?.answer).toContain('2024');
    });

    it('omits the leader question when the season has no rank-1 row', () => {
        const entries = buildHomeFaq({
            coverage,
            leader: null,
            season: { year: 2024 },
            totalRows: 0,
        });
        expect(
            questions(entries).some((q) => q.includes('leading')),
        ).toBeFalsy();
        expect(
            entries.some((entry) => entry.answer.includes('0')),
        ).toBeTruthy();
    });

    it('counts clubs in this season, not all-time', () => {
        const entries = buildHomeFaq({
            coverage,
            leader,
            season: { year: 2024 },
            totalRows: 3,
        });
        const count = entries.find((entry) =>
            entry.question.includes('How many clubs'),
        );
        expect(count?.answer).toContain('3');
        expect(count?.answer).not.toContain('32');
    });

    it('names in-progress years and does not treat absent years as in progress', () => {
        const entries = buildHomeFaq({
            coverage: coverageOf({ rankedYears: [2024, 2025] }),
            leader,
            season: { year: 2025 },
            totalRows: 10,
        });
        const progress = entries.find((entry) =>
            entry.question.includes('in progress'),
        );
        expect(progress?.answer).toContain('2026');
        expect(progress?.answer).not.toContain('2022');
    });
});

describe(buildClubFaq, () => {
    const full = {
        profile: {
            bestRank: 1,
            bestRankYear: 2024,
            careerPoints: 40,
            club: { name: 'Contax' },
            currentRank: 2,
            minorPremierships: 3,
            winPercentage: 62.5,
        },
        topOpponents: [{ club: { name: 'Garville' }, played: 4 }],
    };

    it('answers rank, best finish, career totals, win rate and top opponent', () => {
        const entries = buildClubFaq(full);
        expect(questions(entries)).toHaveLength(5);
        expect(entries[0]?.answer).toContain('2nd');
        expect(entries[1]?.answer).toContain('2024');
        expect(entries[3]?.answer).toContain('62.5%');
        expect(entries[4]?.answer).toContain('Garville');
    });

    it('omits win-rate and opponent questions when those facts are missing', () => {
        const entries = buildClubFaq({
            profile: {
                ...full.profile,
                currentRank: null,
                bestRank: null,
                bestRankYear: null,
                winPercentage: null,
            },
            topOpponents: [],
        });
        expect(questions(entries)).toStrictEqual([
            'How many career championship points and minor premierships does Contax have?',
        ]);
    });
});

describe(buildSiteFaq, () => {
    const coverage = coverageOf({ rankedYears: [2000, 2024, 2025] });

    it('names the latest-season leader and the fixture year when both exist', () => {
        const entries = buildSiteFaq({
            coverage,
            fixtureFromYear: 2025,
            latestRankedYear: 2025,
            leader,
        });
        const what = entries.find((entry) =>
            entry.question.includes('What is the South Australian'),
        );
        expect(what?.answer).toContain('Contax');
        expect(what?.answer).toContain('2025');
        const source = entries.find((entry) =>
            entry.question.includes('Where does the data'),
        );
        expect(source?.answer).toContain('2025');
        const find = entries.find((entry) =>
            entry.question.includes("find a club's results"),
        );
        expect(find?.answer).toContain('/clubs');
        expect(find?.answer).toContain('/results');
        expect(find?.answer).toContain('/head-to-head');
    });

    it('omits the fixture clause when there are no games', () => {
        const entries = buildSiteFaq({
            coverage,
            fixtureFromYear: null,
            latestRankedYear: 2025,
            leader,
        });
        const source = entries.find((entry) =>
            entry.question.includes('Where does the data'),
        );
        expect(source?.answer).not.toContain('Fixture-level results');
    });

    it('names in-progress years and does not treat absent years as in progress', () => {
        const entries = buildSiteFaq({
            coverage,
            fixtureFromYear: null,
            latestRankedYear: 2025,
            leader: null,
        });
        const progress = entries.find((entry) =>
            entry.question.includes('in-progress seasons ranked'),
        );
        expect(progress?.answer).toContain('2026');
        expect(progress?.answer).not.toContain('2022');
        const what = entries.find((entry) =>
            entry.question.includes('What is the South Australian'),
        );
        expect(what?.answer).not.toContain('leads with');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vp test src/seo/faq.test.ts`

Expected: FAIL — builders are not exported

- [ ] **Step 3: Implement the builders**

Replace the body of `src/seo/faq.ts` with the following. Keep the existing file header comment about one source for page + JSON-LD. Keep `HOME_FAQ` and `METHOD_FAQ` exactly as they are today, then append the builders.

```ts
import { isNull, isUndefined } from 'es-toolkit';
import { ordinal } from '@/seo/descriptions';
import type { FaqEntry } from '@/seo/structured-data';
import type { ChampionshipLeader } from '@/server/dto/rankings.dto';
import type { Coverage } from '@/server/dto/shared.dto';

// ... existing HOME_FAQ and METHOD_FAQ unchanged ...

function joinAnd(items: readonly string[]): string {
    if (items.length === 0) {
        return '';
    }
    if (items.length === 1) {
        return items[0] ?? '';
    }
    return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

function inProgressYears(coverage: Coverage): readonly number[] {
    const years = new Set<number>();
    for (const entry of coverage.competitions) {
        for (const season of entry.seasons) {
            if (season.status === 'in-progress') {
                years.add(season.year);
            }
        }
    }
    return [...years].toSorted((left, right) => left - right);
}

function progressClause(coverage: Coverage): string {
    const years = inProgressYears(coverage).map(String);
    if (years.length === 0) {
        return 'No season is currently in progress.';
    }
    const verb = years.length === 1 ? 'is' : 'are';
    return `${joinAnd(years)} ${verb} still in progress and ${verb} not ranked.`;
}

export function buildHomeFaq(data: {
    readonly coverage: Coverage;
    readonly leader: ChampionshipLeader | null;
    readonly season: { readonly year: number };
    readonly totalRows: number;
}): readonly FaqEntry[] {
    const { year } = data.season;
    const entries: FaqEntry[] = [];
    if (!isNull(data.leader)) {
        entries.push({
            answer: `${data.leader.club.name} is leading the ${String(year)} club championship with ${data.leader.points.toLocaleString('en-AU')} points from ${String(data.leader.teams)} teams.`,
            question: `Who is leading the ${String(year)} club championship?`,
        });
    }
    entries.push({
        answer: `${String(data.totalRows)} clubs are in the ${String(year)} championship standings.`,
        question: `How many clubs are in the ${String(year)} standings?`,
    });
    const ranked = data.coverage.rankedYears;
    const span =
        ranked.length === 0
            ? 'No seasons are ranked yet.'
            : `${String(ranked.length)} seasons are ranked, from ${String(Math.min(...ranked))}–${String(Math.max(...ranked))}.`;
    entries.push({
        answer: `${span} ${progressClause(data.coverage)}`,
        question:
            'How many seasons are ranked, and is a season still in progress?',
    });
    return entries;
}

export function buildClubFaq(data: {
    readonly profile: {
        readonly bestRank: number | null;
        readonly bestRankYear: number | null;
        readonly careerPoints: number;
        readonly club: { readonly name: string };
        readonly currentRank: number | null;
        readonly minorPremierships: number;
        readonly winPercentage: number | null;
    };
    readonly topOpponents: readonly {
        readonly club: { readonly name: string };
        readonly played: number;
    }[];
}): readonly FaqEntry[] {
    const { name } = data.profile.club;
    const entries: FaqEntry[] = [];
    if (!isNull(data.profile.currentRank)) {
        entries.push({
            answer: `${name} is ranked ${ordinal(data.profile.currentRank)} in the latest ranked season.`,
            question: `What is ${name}'s latest championship rank?`,
        });
    }
    if (!isNull(data.profile.bestRank) && !isNull(data.profile.bestRankYear)) {
        entries.push({
            answer: `${name}'s best championship finish is ${ordinal(data.profile.bestRank)} in ${String(data.profile.bestRankYear)}.`,
            question: `What is ${name}'s best championship finish?`,
        });
    }
    entries.push({
        answer: `${name} has ${data.profile.careerPoints.toLocaleString('en-AU')} career championship points and ${String(data.profile.minorPremierships)} minor premierships.`,
        question: `How many career championship points and minor premierships does ${name} have?`,
    });
    if (!isNull(data.profile.winPercentage)) {
        entries.push({
            answer: `${name}'s win rate since 2022 is ${data.profile.winPercentage.toFixed(1)}%.`,
            question: `What is ${name}'s win rate since 2022?`,
        });
    }
    const opponent = data.topOpponents[0];
    if (!isUndefined(opponent)) {
        entries.push({
            answer: `${name} has played ${opponent.club.name} most often since 2025, with ${String(opponent.played)} meetings.`,
            question: `Who has ${name} played most often since 2025?`,
        });
    }
    return entries;
}

function coverageAnswer(coverage: Coverage): string {
    const names = coverage.competitions.map((entry) => entry.competition.name);
    const listed =
        names.length === 0
            ? 'No competitions are in the dataset yet'
            : joinAnd(names);
    const span =
        coverage.rankedYears.length === 0
            ? 'There are no ranked seasons yet'
            : `Ranked seasons run ${String(Math.min(...coverage.rankedYears))}–${String(Math.max(...coverage.rankedYears))}`;
    const gapYears = coverage.timelineGaps.flatMap((gap) => gap.missingYears);
    const gaps =
        gapYears.length === 0
            ? 'There are no gaps in the covered years.'
            : `${joinAnd(gapYears.map(String))} are not covered, and the site marks those gaps rather than interpolating them.`;
    return `${listed}. ${span}. Seasons from 2022 use published PlayHQ regular-season ladders; earlier AMND seasons come from archived Final Premiership Placings PDFs where those survive. ${gaps}`;
}

export function buildSiteFaq(data: {
    readonly coverage: Coverage;
    readonly fixtureFromYear: number | null;
    readonly latestRankedYear: number | null;
    readonly leader: ChampionshipLeader | null;
}): readonly FaqEntry[] {
    const what = [
        "It is a single score per club per season, published on this site. A club's championship score is the sum, across every grade it fields a team in, of its ladder finish converted to points and multiplied by that grade's weight. It rewards both finishing high and fielding depth, so it is not an official Netball SA award — it is an open, reproducible ranking built from published ladders.",
    ];
    if (!isNull(data.leader) && !isNull(data.latestRankedYear)) {
        what.push(
            ` In ${String(data.latestRankedYear)}, ${data.leader.club.name} leads with ${data.leader.points.toLocaleString('en-AU')} championship points from ${String(data.leader.teams)} teams.`,
        );
    }
    const fixture = isNull(data.fixtureFromYear)
        ? ''
        : ` Fixture-level results — round, date, both sides and the score — exist from ${String(data.fixtureFromYear)} onward, so head-to-head records cover meetings since ${String(data.fixtureFromYear)} rather than all time.`;
    const findFixture = isNull(data.fixtureFromYear)
        ? ''
        : ` Fixture-level pages cover ${String(data.fixtureFromYear)} onward.`;
    return [
        {
            answer: what.join(''),
            question: 'What is the South Australian netball club championship?',
        },
        {
            answer: coverageAnswer(data.coverage),
            question: 'Which competitions and seasons are covered?',
        },
        {
            answer: 'For each team, a ladder finish is converted to points by field size: first in a grade of ten earns ten points, second earns nine, and so on. Each grade is then multiplied by a weight reflecting its standard, from 1.0 for Premier Division down to the low tenths for junior and lower metro divisions. The club’s score for the season is the sum across all of its teams.',
            question: 'How is a club championship score calculated?',
        },
        {
            answer: 'Championship score sums across teams, so fielding more teams raises it. Club strength averages: for one team it is (team_count − ladder_position) ÷ (team_count − 1), giving 1.00 for topping a grade and 0.00 for finishing bottom, and a club’s strength is the mean across its teams. A club that cuts from eight teams to five strong ones can show rising strength and falling championship points in the same season.',
            question:
                'What is the difference between championship score and club strength?',
        },
        {
            answer: `Published PlayHQ ladders and fixtures for Netball SA and AMND from 2022 onward, and archived AMND Final Premiership Placings PDFs for earlier seasons.${fixture}`,
            question: 'Where does the data come from?',
        },
        {
            answer: `No. A mid-season ladder is not a finish, so seasons still being played are shown as in progress and excluded from the championship rankings until they complete. ${progressClause(data.coverage)}`,
            question: 'Are in-progress seasons ranked?',
        },
        {
            answer: `Open a club’s page from /clubs for championship rank, grade finishes and recent opponents. Fixture-by-fixture scores are on /results, and two-club records are on /head-to-head.${findFixture}`,
            question: "How do I find a club's results?",
        },
    ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vp test src/seo/faq.test.ts`

Expected: PASS. If an assertion fails on exact wording, fix the builder — do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add src/seo/faq.ts src/seo/faq.test.ts
git commit -m "$(cat <<'EOF'
feat: build home, club and site FAQ entries from page data

EOF
)"
```

---

### Task 5: `FaqService` and container wiring

**Files:**

- Create: `src/server/dto/faq.dto.ts`
- Create: `src/server/services/faq.service.ts`
- Create: `src/server/services/faq.service.test.ts`
- Modify: `src/server/container.ts`

**Interfaces:**

- Consumes: `GamesRepo.earliestYear()` (Task 2), `Championship.leader()` (Task 1), `Repos.seasons.fullCoverage()`, `Repos.championship.history()`
- Produces:

```ts
// src/server/dto/faq.dto.ts
export interface FaqPageDto {
    readonly coverage: Coverage;
    readonly fixtureFromYear: number | null;
    readonly latestRankedYear: number | null;
    readonly leader: ChampionshipLeader | null;
}

export interface FaqService {
    readonly getPage: () => Promise<Result<FaqPageDto, DomainError>>;
}
```

`getPage()` always returns `ok` for empty data. A `Championship.fromHistory` miss sets `leader` to `null` and still returns 200-shaped `ok`. `latestRankedYear` is `coverage.rankedYears.at(-1) ?? null`.

- [ ] **Step 1: Write the failing service tests**

Create `src/server/services/faq.service.test.ts`. Reuse the rankings `baseSpec` shape (2024/2025 final, 2026 not final). Copy that spec into this file — do not import from the rankings test.

```ts
import { describe, expect, it } from 'vitest';
import { createServices } from '@/server/container';
import type { DomainError, Result } from '@/server/domain/result';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed, seedGames } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

function unwrap<T>(result: Result<T, DomainError>): T {
    if (!result.ok) {
        throw new Error(
            `expected ok result, got error: ${JSON.stringify(result.error)}`,
        );
    }
    return result.value;
}

function baseSpec(): SeedSpec {
    return {
        competitions: [
            {
                key: 'amnd',
                name: 'AMND',
                seasons: [
                    {
                        grades: [
                            {
                                gradeKey: 'amnd-2024-a1',
                                name: 'A1',
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
                                teamCount: 2,
                                tier: 2,
                            },
                        ],
                        isFinal: true,
                        seasonKey: 'amnd-2024',
                        startYear: 2024,
                    },
                    {
                        grades: [
                            {
                                gradeKey: 'amnd-2025-a1',
                                name: 'A1',
                                results: [
                                    {
                                        clubKey: 'garville',
                                        clubName: 'Garville',
                                        displayName: 'Garville',
                                        ladderPosition: 1,
                                    },
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        ladderPosition: 2,
                                    },
                                ],
                                teamCount: 2,
                                tier: 2,
                            },
                        ],
                        isFinal: true,
                        seasonKey: 'amnd-2025',
                        startYear: 2025,
                    },
                    {
                        grades: [
                            {
                                gradeKey: 'amnd-2026-a1',
                                name: 'A1',
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        ladderPosition: 1,
                                    },
                                ],
                                teamCount: 1,
                                tier: 2,
                            },
                        ],
                        isFinal: false,
                        seasonKey: 'amnd-2026',
                        startYear: 2026,
                    },
                ],
            },
        ],
    };
}

describe('faq service', () => {
    it('uses the latest ranked season for the leader and skips in-progress years', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());
        const page = unwrap(await createServices(db).faq.getPage());
        expect(page.latestRankedYear).toBe(2025);
        expect(page.leader?.club.key).toBe('garville');
        expect(page.fixtureFromYear).toBeNull();
    });

    it('reports the earliest fixture year when games exist', async () => {
        const db = createTestDb();
        const seeded = await seed(db, baseSpec());
        await seedGames(db, seeded, [
            {
                away: 'garville',
                awayScore: 30,
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                homeScore: 40,
                round: 1,
            },
        ]);
        const page = unwrap(await createServices(db).faq.getPage());
        expect(page.fixtureFromYear).toBe(2025);
    });

    it('returns ok with null leader when the latest ranked year has no championship rows', async () => {
        const db = createTestDb();
        await seed(db, {
            competitions: [
                {
                    key: 'empty-comp',
                    name: 'Empty Comp',
                    seasons: [
                        {
                            grades: [],
                            isFinal: true,
                            seasonKey: 'empty-2023',
                            startYear: 2023,
                        },
                    ],
                },
            ],
        });
        const page = unwrap(await createServices(db).faq.getPage());
        expect(page.latestRankedYear).toBe(2023);
        expect(page.leader).toBeNull();
    });

    it('returns ok over an empty database', async () => {
        const db = createTestDb();
        const page = unwrap(await createServices(db).faq.getPage());
        expect(page.latestRankedYear).toBeNull();
        expect(page.leader).toBeNull();
        expect(page.fixtureFromYear).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vp test src/server/services/faq.service.test.ts`

Expected: FAIL — `faq` is not on the services object

- [ ] **Step 3: Implement DTO, service, and wiring**

`src/server/dto/faq.dto.ts`:

```ts
import type { ChampionshipLeader } from '@/server/dto/rankings.dto';
import type { Coverage } from '@/server/dto/shared.dto';

export interface FaqPageDto {
    readonly coverage: Coverage;
    readonly fixtureFromYear: number | null;
    readonly latestRankedYear: number | null;
    readonly leader: ChampionshipLeader | null;
}
```

`src/server/services/faq.service.ts`:

```ts
import { isNull } from 'es-toolkit';
import type { Repos } from '@/server/container';
import { Championship } from '@/server/domain/championship';
import type { DomainError, Result } from '@/server/domain/result';
import { ok } from '@/server/domain/result';
import type { FaqPageDto } from '@/server/dto/faq.dto';
import type { ChampionshipLeader } from '@/server/dto/rankings.dto';

export interface FaqService {
    readonly getPage: () => Promise<Result<FaqPageDto, DomainError>>;
}

export function createFaqService(repos: Repos): FaqService {
    return {
        async getPage(): Promise<Result<FaqPageDto, DomainError>> {
            const coverage = await repos.seasons.fullCoverage();
            const latestRankedYear = coverage.rankedYears.at(-1) ?? null;
            let leader: ChampionshipLeader | null = null;
            if (!isNull(latestRankedYear)) {
                const history = await repos.championship.history();
                const championship = Championship.fromHistory(
                    history,
                    latestRankedYear,
                );
                if (championship.ok) {
                    const row = championship.value.leader();
                    leader = isNull(row)
                        ? null
                        : {
                              club: row.club,
                              points: row.points,
                              teams: row.teams,
                          };
                }
            }
            return ok({
                coverage,
                fixtureFromYear: await repos.games.earliestYear(),
                latestRankedYear,
                leader,
            });
        },
    };
}
```

In `src/server/container.ts`:

- Import `createFaqService` and `FaqService`
- Add `readonly faq: FaqService` to `Services` (keys sorted: `admin`, `clubs`, `faq`, `headToHead`, `ladders`, `method`, `rankings`, `results`)
- Add `faq: createFaqService(repos)` in `createServices` (same key order)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vp test src/server/services/faq.service.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/dto/faq.dto.ts src/server/services/faq.service.ts src/server/services/faq.service.test.ts src/server/container.ts
git commit -m "$(cat <<'EOF'
feat: assemble site FAQ facts from coverage, leader and fixtures

EOF
)"
```

---

### Task 6: `/faq` route, page, footer, cache

**Files:**

- Create: `src/routes/faq.tsx`
- Create: `src/components/faq/faq-page.tsx`
- Create: `src/seo/cache-control.ts`
- Create: `src/seo/cache-control.test.ts`
- Modify: `src/start.ts`
- Modify: `src/components/site-footer.tsx`
- Modify: `src/routes/-routes.response.test.ts`
- Modify: `src/seo/head.test.ts`

**Interfaces:**

- Consumes: `createServices(db).faq.getPage()`, `buildSiteFaq`, `FaqPageDto`
- Produces: public `/faq` page, footer link labelled `FAQ` in the Data column, `Cache-Control: public, max-age=604800` on `/faq` HTML and markdown

- [ ] **Step 1: Write the failing cache-control tests**

Create `src/seo/cache-control.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cacheControlFor } from '@/seo/cache-control';

describe(cacheControlFor, () => {
    it('gives /faq a week on HTML and markdown', () => {
        expect(cacheControlFor('/faq', 'html')).toBe('public, max-age=604800');
        expect(cacheControlFor('/faq', 'markdown')).toBe(
            'public, max-age=604800',
        );
    });

    it('leaves other HTML pages uncached and markdown at five minutes', () => {
        expect(cacheControlFor('/', 'html')).toBeUndefined();
        expect(cacheControlFor('/clubs/contax', 'html')).toBeUndefined();
        expect(cacheControlFor('/method', 'markdown')).toBe(
            'public, max-age=300',
        );
    });
});
```

Add `'/faq'` to `PAGE_ROUTES` in `src/routes/-routes.response.test.ts` (import `@/routes/faq`) and to `PATHS` in `src/seo/head.test.ts`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vp test src/seo/cache-control.test.ts src/routes/-routes.response.test.ts`

Expected: FAIL — missing module `@/seo/cache-control` and/or `@/routes/faq`

- [ ] **Step 3: Implement helper, route, page, footer, middleware**

`src/seo/cache-control.ts`:

```ts
const WEEK = 'public, max-age=604800';
const MARKDOWN = 'public, max-age=300';

export function cacheControlFor(
    path: string,
    kind: 'html' | 'markdown',
): string | undefined {
    if (path === '/faq') {
        return WEEK;
    }
    if (kind === 'markdown') {
        return MARKDOWN;
    }
    return undefined;
}
```

`src/components/faq/faq-page.tsx`:

```ts
import { getRouteApi } from '@tanstack/react-router';
import type { JSX } from 'react';
import { FaqSection } from '@/components/faq-section';
import { Eyebrow, PageShell, PageTitle } from '@/components/ui/layout';
import { buildSiteFaq } from '@/seo/faq';

const routeApi = getRouteApi('/faq');

export function FaqPage(): JSX.Element {
    const data = routeApi.useLoaderData();
    const entries = buildSiteFaq(data);
    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <article className="max-w-[62ch]">
                <Eyebrow>{'FAQ'}</Eyebrow>
                <div className="mt-4 mb-10">
                    <PageTitle>{'Common questions'}</PageTitle>
                </div>
                <p className="text-lg leading-[1.55] text-ink-body">
                    {
                        'Answers about South Australian netball clubs, championship rankings and fixture results, built from the published dataset on this site.'
                    }
                </p>
            </article>
            {entries.length > 0 ? <FaqSection entries={entries} /> : null}
        </PageShell>
    );
}
```

`src/routes/faq.tsx` — copy the `/method` loader/`head` shape:

```ts
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { isUndefined } from 'es-toolkit';
import { FaqPage } from '@/components/faq/faq-page';
import { getDb } from '@/db';
import { buildSiteFaq } from '@/seo/faq';
import { pageHead } from '@/seo/head';
import { breadcrumbSchema, faqSchema } from '@/seo/structured-data';
import { createServices, resolvePageResult } from '@/server/container';
import type { FaqPageDto } from '@/server/dto/faq.dto';

export type { FaqPageDto as FaqData } from '@/server/dto/faq.dto';

const loadFaq = createServerFn({ method: 'GET' }).handler(async () =>
    resolvePageResult(await createServices(getDb()).faq.getPage()),
);

const DESCRIPTION =
    'Common questions about South Australian netball club rankings, coverage and fixture results, answered from the published dataset.';

export const Route = createFileRoute('/faq')({
    loader: async () => await loadFaq(),
    head: ({ loaderData }: { loaderData?: FaqPageDto }) => {
        const entries = isUndefined(loaderData) ? [] : buildSiteFaq(loaderData);
        return pageHead({
            description: DESCRIPTION,
            path: '/faq',
            schema: [
                breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'FAQ', path: '/faq' },
                ]),
                ...(entries.length === 0 ? [] : [faqSchema(entries)]),
            ],
            title: 'Common questions',
        });
    },
    component: FaqPage,
});
```

In `src/components/site-footer.tsx`, inside the Data `<nav>`, add after the About link (before `llms.txt`):

```tsx
<Link
    to="/faq"
    className="text-sm text-ink-body no-underline hover:underline"
>
    {'FAQ'}
</Link>
```

In `src/start.ts`:

1. Import `cacheControlFor` from `@/seo/cache-control`.
2. In `markdownTwin`, replace the hardcoded `'cache-control': 'public, max-age=300'` with `'cache-control': cacheControlFor(path, 'markdown') ?? 'public, max-age=300'`.
3. Add middleware and register it:

```ts
const pageCache = createMiddleware({ type: 'request' }).server(
    async ({ request, next }) => {
        const result = await next();
        const path = normalisePath(new URL(request.url).pathname);
        const control = cacheControlFor(path, 'html');
        if (!isUndefined(control)) {
            result.response.headers.set('cache-control', control);
        }
        return result;
    },
);
```

Import `isUndefined` from `es-toolkit` if not already present. Middleware order:

```ts
    requestMiddleware: [canonicalHost, discoveryLinks, pageCache, markdownTwin],
```

`pageCache` sits inside `discoveryLinks` so Link headers still apply, and outside `markdownTwin` so `/faq` HTML (which falls through `markdownTwin` to `next()`) gets the week-long header.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vp test src/seo/cache-control.test.ts src/routes/-routes.response.test.ts src/seo/head.test.ts`

Expected: PASS. Then `vp check` and fix any format/lint the new files trip.

- [ ] **Step 5: Commit**

```bash
git add src/seo/cache-control.ts src/seo/cache-control.test.ts src/seo/head.test.ts src/routes/faq.tsx src/routes/-routes.response.test.ts src/components/faq/faq-page.tsx src/components/site-footer.tsx src/start.ts
git commit -m "$(cat <<'EOF'
feat: add footer-linked /faq page with a one-week cache

EOF
)"
```

---

### Task 7: Wire Home and club profile

**Files:**

- Modify: `src/routes/index.tsx`
- Modify: `src/components/rankings/rankings-page.tsx`
- Modify: `src/routes/clubs.$clubKey.tsx`
- Modify: `src/components/club/club-profile-page.tsx`
- Modify: `src/seo/faq.ts` — delete `HOME_FAQ`
- Modify: `src/seo/markdown/pages.ts` — `renderRankings` must call `buildHomeFaq` so `HOME_FAQ` can be deleted
- Modify: `src/routes/-routes.response.test.ts` — club head still works with extra schema

**Interfaces:**

- Consumes: `buildHomeFaq(RankingsPageDto)`, `buildClubFaq(ClubProfilePageDto)`
- Produces: Home and club pages render `FaqSection` from those builders; `head()` emits matching `faqSchema` when the list is non-empty; `HOME_FAQ` is gone

- [ ] **Step 1: Write the failing club-head assertion**

In `src/routes/-routes.response.test.ts`, extend the existing `'builds the club profile head from the loaded club'` fixture so `loaderData` also has `topOpponents: []` and `winPercentage: null` (plus the fields `buildClubFaq` reads). Then assert:

```ts
expect(JSON.stringify(head?.meta)).toContain('FAQPage');
expect(JSON.stringify(head?.meta)).toContain(
    'How many career championship points and minor premierships does Contax have?',
);
```

The current fixture is missing `topOpponents`; add it. Keep `SportsTeam` / `Contax` assertions.

- [ ] **Step 2: Run the test to verify it fails**

Run: `vp test src/routes/-routes.response.test.ts`

Expected: FAIL — club head has no `FAQPage`

- [ ] **Step 3: Wire the three call sites and delete `HOME_FAQ`**

`src/routes/index.tsx`:

- Import `buildHomeFaq` instead of `HOME_FAQ`.
- Import `isUndefined` from `es-toolkit`.
- Annotate `head` like Method (see `src/routes/method.tsx`):

```ts
    head: ({
        loaderData,
    }: {
        loaderData?: RankingsPageDto;
    }) => {
        const entries = isUndefined(loaderData)
            ? []
            : buildHomeFaq(loaderData);
        return pageHead({
            title: SITE.name,
            description: DESCRIPTION,
            path: '/',
            schema: [
                datasetSchema({
                    name: 'South Australian netball club championship',
                    description: DESCRIPTION,
                    path: '/',
                    temporalCoverage: '2000/..',
                }),
                ...(entries.length === 0 ? [] : [faqSchema(entries)]),
            ],
        });
    },
```

Import `RankingsPageDto` from `@/server/dto/rankings.dto` (the route already re-exports it as `RankingsData` — use the DTO type for the annotation).

`src/components/rankings/rankings-page.tsx`:

- Import `buildHomeFaq` instead of `HOME_FAQ`.
- Replace `<FaqSection entries={HOME_FAQ} />` with:

```tsx
<FaqSection entries={buildHomeFaq(data)} />
```

`src/routes/clubs.$clubKey.tsx`:

- Import `buildClubFaq`, `faqSchema`, `isUndefined` (file already has `isUndefined`).
- After the existing schema nodes, spread FAQ only when entries exist:

```ts
const entries = isUndefined(loaderData) ? [] : buildClubFaq(loaderData);
return pageHead({
    title: name,
    description,
    path,
    schema: [
        {/* existing SportsTeam node, unchanged */},
        breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Clubs', path: '/clubs' },
            { name, path },
        ]),
        ...(entries.length === 0 ? [] : [faqSchema(entries)]),
    ],
});
```

`src/components/club/club-profile-page.tsx`:

- Import `FaqSection` and `buildClubFaq`.
- After the results table / empty panel, before the closing `</PageShell>`:

```tsx
<FaqSection entries={buildClubFaq({ profile, topOpponents })} />
```

`src/seo/markdown/pages.ts`: import `buildHomeFaq` and replace `faqBlock(HOME_FAQ)` with `faqBlock(buildHomeFaq(data))`. Club markdown FAQ lands in Task 8.

`src/seo/faq.ts`: delete the `HOME_FAQ` export and its array. `rg HOME_FAQ` must be empty after this task.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vp test src/routes/-routes.response.test.ts src/seo/faq.test.ts src/components/rankings src/components/club`

Expected: PASS. Then `vp check`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/index.tsx src/components/rankings/rankings-page.tsx src/routes/clubs.$clubKey.tsx src/components/club/club-profile-page.tsx src/seo/faq.ts src/seo/markdown/pages.ts src/routes/-routes.response.test.ts
git commit -m "$(cat <<'EOF'
feat: render data-backed FAQ on home and club profiles

EOF
)"
```

---

### Task 8: Markdown twins, sitemap, llms.txt

**Files:**

- Modify: `src/seo/markdown/pages.ts`
- Modify: `src/seo/markdown/resolve.ts`
- Modify: `src/seo/markdown/resolve.test.ts`
- Modify: `src/seo/sitemap.ts`
- Modify: `src/seo/agent-files.ts`
- Modify: `src/seo/agent-files.test.ts`

**Interfaces:**

- Consumes: `buildHomeFaq`, `buildClubFaq`, `buildSiteFaq`, `FaqPageDto`
- Produces: `/faq.md` twin; Home and club markdown include the same questions as HTML; sitemap and `llms.txt` list FAQ

- [ ] **Step 1: Write the failing tests**

In `src/seo/agent-files.test.ts` `describe(sitemapXml)` first test, add:

```ts
expect(xml).toContain('<loc>https://netballsa.com/faq</loc>');
```

In `describe(llmsTxt)` `links the markdown twins` test, add:

```ts
expect(body).toContain('https://netballsa.com/faq.md');
```

In `src/seo/markdown/resolve.test.ts`, add:

```ts
it('renders the FAQ twin from the same builders as the HTML page', async () => {
    const db = await seededDb();
    const body = await renderMarkdown(db, url('/faq.md'));
    expect(body).toContain('# Common questions');
    expect(body).toContain(
        'What is the South Australian netball club championship?',
    );
    expect(body).toContain('## Frequently asked questions');
});
```

`seededDb()` already seeds 2024 ladders and one 2024 game, so `buildSiteFaq` will mention 2024 fixtures.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `vp test src/seo/agent-files.test.ts src/seo/markdown/resolve.test.ts`

Expected: FAIL — no `/faq` loc, no `/faq.md` twin (`renderMarkdown` returns null; the new test fails on `toContain`)

- [ ] **Step 3: Implement the twins and discovery files**

`src/seo/markdown/pages.ts`:

- Import `buildClubFaq` and `buildSiteFaq` (`buildHomeFaq` is already imported from Task 7).
- Import `FaqPageDto`.
- In the rankings “Other pages” list, add `- [FAQ](/faq.md) — common questions about clubs and results` after the Method line.
- In `renderClubProfile`, after the top-opponents section, append `faqBlock(buildClubFaq(data))`.
- Add:

```ts
export function renderFaq(data: FaqPageDto): string {
    return [
        header({
            description:
                'Common questions about South Australian netball club rankings, coverage and fixture results, answered from the published dataset.',
            path: '/faq',
            title: 'Common questions',
        }),
        '',
        faqBlock(buildSiteFaq(data)),
    ].join('\n');
}
```

`src/seo/markdown/resolve.ts`:

- Import `renderFaq`.
- Before the final `return null`, add:

```ts
if (path === '/faq') {
    return render(await services.faq.getPage(), renderFaq);
}
```

- Add `'/faq'` to `MARKDOWN_PATHS` (after `'/head-to-head'`, before `'/method'`).

`src/seo/sitemap.ts` — add to `STATIC_ENTRIES` after head-to-head:

```ts
    { changefreq: 'weekly', path: '/faq', priority: '0.6' },
```

`src/seo/agent-files.ts` — in the Pages list, after the Method bullet:

```ts
        `- [FAQ](${absoluteUrl('/faq.md')}): common questions about the championship, coverage and fixture results.`,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `vp test src/seo/agent-files.test.ts src/seo/markdown/resolve.test.ts src/seo/faq.test.ts`

Expected: PASS. Then `vp check` and `vp test` (full suite).

- [ ] **Step 5: Commit**

```bash
git add src/seo/markdown/pages.ts src/seo/markdown/resolve.ts src/seo/markdown/resolve.test.ts src/seo/sitemap.ts src/seo/agent-files.ts src/seo/agent-files.test.ts
git commit -m "$(cat <<'EOF'
feat: publish FAQ markdown, sitemap and llms.txt entries

EOF
)"
```

---

## Self-review

**Spec coverage**

| Spec requirement                                    | Task                   |
| --------------------------------------------------- | ---------------------- |
| Per-club Q&A on `/clubs/$clubKey`                   | 4, 7, 8                |
| Answers derived from page data / small FAQ DTO      | 3, 4, 5                |
| `/faq` site-wide, footer Data column only           | 6                      |
| Home season-only list, no shared question text      | 4, 7                   |
| Method FAQ unchanged                                | 4 (leave `METHOD_FAQ`) |
| Omit missing facts                                  | 4 tests                |
| Leader from unsorted season                         | 1, 3                   |
| Home club count is `totalRows`                      | 4                      |
| In-progress ≠ absent                                | 4                      |
| `GamesRepo.earliestYear`, no hardcoded 2025         | 2, 5                   |
| `/faq` 200 when `fromHistory` misses                | 5                      |
| Week cache on `/faq` only                           | 6                      |
| Same array on page / JSON-LD / markdown             | 6, 7, 8                |
| Sitemap, llms.txt, `/faq.md`                        | 8                      |
| Out of scope (other pages, KV, admin, method edits) | not tasked             |

**Type consistency**

- `ChampionshipLeader` is `{ club, points, teams }` in Task 3 and reused in Tasks 4–5.
- `FaqPageDto` fields match `buildSiteFaq` input: `coverage`, `fixtureFromYear`, `latestRankedYear`, `leader`.
- `Championship.leader(): ChampionshipRow | null` in Task 1; services map to `ChampionshipLeader`.
- `GamesRepo.earliestYear(): Promise<number | null>` in Task 2; `FaqPageDto.fixtureFromYear` in Task 5.
