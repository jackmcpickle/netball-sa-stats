# Club Trend Graphs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show on each club profile whether the club's on-court performance is trending up or down over 26 seasons, independent of how many teams it fields, broken down by grade band.

**Architecture:** A size-independent _strength_ metric (normalised finishing position) computed in the existing pure scoring module, aggregated per club per season and per grade band by the existing query layer, rendered with the existing hand-rolled SVG chart primitives. No new tables, no migration, no new dependencies.

**Tech Stack:** TypeScript, Drizzle + Cloudflare D1, TanStack Start, React 19, Tailwind v4, Vitest. Tooling is Vite+ (`vp check`, `vp test run`, `vp build`).

## Global Constraints

- No new dependencies. No chart library — charts are hand-rolled SVG.
- Lint is strict: explicit return types, `func-style: declaration`, no `==`, unicode regex flags (`/u`), `@/` alias (never relative parent imports), `react-perf` bans object/array/function literals as JSX props, `react/no-multi-comp` (shared primitives live in `src/components/ui/`).
- Run `pnpm exec`, never `npx`. Scripts run under `pnpm exec tsx`, not bare `node`.
- Only `is_final = 1` seasons are ranked. Ranked years are 2000–2014, 2016, 2022–2025.
- Data spans two eras: `source = 'archive_pdf'` (2000–2016, placement only — `played`/`won`/`drawn`/`lost` are always NULL) and `source = 'playhq'` (2022+, full stats).
- **`position_uncertain` rows are included in strength.** 2,408 archive rows are finals-derived top-4 placings. Do not filter them, do not "correct" them. The era is already visually marked.
- Missing values render as em dashes via `NO_VALUE` in `src/components/format.ts`, never as `0`.
- Reuse `src/db/queries/era-break.ts` (`timelineGaps`, `methodologyBreak`, `movementBoundaryChanged`) and `src/components/charts/timeline-slots.ts`. Do not reimplement gap or era-break logic.

---

### Task 1: Expose grade tier and band labels

`tier` is used in the results query's join and ordering but never selected, so nothing downstream can group by band. Band labels already exist in `BANDS` in `src/pipeline/seed/catalogue.ts`.

**Files:**

- Modify: `src/db/queries/results.ts` (add `tier` to `ResultRow` and the select)
- Create: `src/pipeline/scoring/bands.ts`
- Test: `src/pipeline/scoring/bands.test.ts`

**Interfaces:**

- Consumes: `BANDS` from `@/pipeline/seed/catalogue`
- Produces: `ResultRow.tier: number`; `bandLabel(tier: number): string`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { bandLabel } from '@/pipeline/scoring/bands';

describe('bandLabel', () => {
    it('collapses divisions to one band name', () => {
        expect(bandLabel(10)).toBe('Primary');
        expect(bandLabel(5)).toBe('B');
    });

    it('keeps single-grade bands as their own name', () => {
        expect(bandLabel(1)).toBe('Premier Division');
        expect(bandLabel(3)).toBe('AMND League');
    });

    it('falls back rather than throwing on an unknown tier', () => {
        expect(bandLabel(99)).toBe('Tier 99');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test run src/pipeline/scoring/bands.test.ts`
Expected: FAIL — cannot resolve `@/pipeline/scoring/bands`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { BANDS } from '@/pipeline/seed/catalogue';

const LABELS = new Map<number, string>(
    BANDS.map((band) => [band.tier, band.label]),
);

/** Divisions collapse: Primary 1 and Primary 2 are both "Primary". */
export function bandLabel(tier: number): string {
    return LABELS.get(tier) ?? `Tier ${String(tier)}`;
}
```

`BANDS` is currently module-private in `src/pipeline/seed/catalogue.ts`. Change `const BANDS` to `export const BANDS`. Do not otherwise alter that file — its weights are live data.

- [ ] **Step 4: Add `tier` to `ResultRow`**

In `src/db/queries/results.ts`, add to the interface (beside `teamCount`):

```typescript
    /** Grade band. 1 is Premier Division. Divisions collapse to one band. */
    readonly tier: number;
```

and add `tier: grades.tier,` to the query's select object.

- [ ] **Step 5: Run the full suite**

Run: `vp check && vp test run`
Expected: PASS. Adding a selected column must not change any existing assertion.

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/scoring/bands.ts src/pipeline/scoring/bands.test.ts src/pipeline/seed/catalogue.ts src/db/queries/results.ts
git commit -m "feat: expose grade tier and band labels for trend grouping"
```

---

### Task 2: Strength metric

The championship score is a **sum**, so it scales with squad count. Strength is a **mean**, so it does not.

**Files:**

- Create: `src/pipeline/scoring/strength.ts`
- Test: `src/pipeline/scoring/strength.test.ts`

**Interfaces:**

- Consumes: `ScoringRow` from `@/pipeline/scoring/championship` (has `clubKey`, `year`, `ladderPosition`, `teamCount`, `positionUncertain`); `tier` arrives via the extended row in Task 3
- Produces: `normalisedFinish(ladderPosition: number, teamCount: number): number | null`; `meanStrength(rows: readonly StrengthRow[]): number | null`; `interface StrengthRow { readonly ladderPosition: number; readonly teamCount: number; }`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { meanStrength, normalisedFinish } from '@/pipeline/scoring/strength';

describe('normalisedFinish', () => {
    it('scores the grade winner 1 and the wooden spoon 0', () => {
        expect(normalisedFinish(1, 10)).toBe(1);
        expect(normalisedFinish(10, 10)).toBe(0);
    });

    it('is symmetric about mid-table', () => {
        expect(normalisedFinish(2, 5)).toBeCloseTo(0.75, 5);
        expect(normalisedFinish(4, 5)).toBeCloseTo(0.25, 5);
    });

    it('is independent of grade size at the same relative finish', () => {
        expect(normalisedFinish(2, 3)).toBeCloseTo(
            normalisedFinish(5, 9) ?? -1,
            5,
        );
    });

    it('returns null for a one-team grade rather than dividing by zero', () => {
        expect(normalisedFinish(1, 1)).toBeNull();
    });
});

describe('meanStrength', () => {
    it('averages across a club’s teams', () => {
        expect(
            meanStrength([
                { ladderPosition: 1, teamCount: 5 },
                { ladderPosition: 5, teamCount: 5 },
            ]),
        ).toBeCloseTo(0.5, 5);
    });

    it('ignores unmeasurable rows instead of treating them as zero', () => {
        expect(
            meanStrength([
                { ladderPosition: 1, teamCount: 5 },
                { ladderPosition: 1, teamCount: 1 },
            ]),
        ).toBe(1);
    });

    it('returns null when nothing is measurable', () => {
        expect(meanStrength([])).toBeNull();
        expect(meanStrength([{ ladderPosition: 1, teamCount: 1 }])).toBeNull();
    });

    it('rises when a club sheds its weakest teams', () => {
        const before = meanStrength([
            { ladderPosition: 1, teamCount: 9 },
            { ladderPosition: 9, teamCount: 9 },
            { ladderPosition: 8, teamCount: 9 },
        ]);
        const after = meanStrength([{ ladderPosition: 1, teamCount: 9 }]);
        expect(after).toBeGreaterThan(before ?? 1);
    });
});
```

The last test is the reason this metric exists: the championship score falls in that scenario while performance improved.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test run src/pipeline/scoring/strength.test.ts`
Expected: FAIL — cannot resolve `@/pipeline/scoring/strength`.

- [ ] **Step 3: Write minimal implementation**

```typescript
export interface StrengthRow {
    /** 1 is best. */
    readonly ladderPosition: number;
    readonly teamCount: number;
}

/**
 * Finishing position as 0..1, where 1 won the grade. Size-independent, so a
 * club that fields fewer teams is not punished and one that pads its numbers
 * is not rewarded — the opposite of the championship score, deliberately.
 */
export function normalisedFinish(
    ladderPosition: number,
    teamCount: number,
): number | null {
    if (teamCount <= 1) return null;
    // Out of range means a corrupt row. Clamping would forge a legitimate-
    // looking wooden spoon or grade win; null renders as an em dash instead.
    if (ladderPosition < 1 || ladderPosition > teamCount) return null;
    return (teamCount - ladderPosition) / (teamCount - 1);
}

/** Null when no row is measurable, so callers render a dash rather than 0. */
export function meanStrength(rows: readonly StrengthRow[]): number | null {
    let total = 0;
    let counted = 0;
    for (const row of rows) {
        const value = normalisedFinish(row.ladderPosition, row.teamCount);
        if (value === null) continue;
        total += value;
        counted += 1;
    }
    return counted === 0 ? null : total / counted;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test run src/pipeline/scoring/strength.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/scoring/strength.ts src/pipeline/scoring/strength.test.ts
git commit -m "feat: size-independent club strength metric"
```

---

### Task 3: Club trend series query

**Files:**

- Create: `src/db/queries/club-trend.ts`
- Modify: `src/data/types.ts` (add the three interfaces below)
- Test: `src/db/queries/club-trend.test.ts`

**Interfaces:**

- Consumes: `fetchResults` and `ResultRow` from `@/db/queries/results`; `meanStrength` from `@/pipeline/scoring/strength`; `bandLabel` from `@/pipeline/scoring/bands`
- Produces: `buildClubTrend(rows: readonly ResultRow[], rankedYears: readonly number[]): ClubTrend`

Add to `src/data/types.ts`:

```typescript
export interface ClubTrendPoint {
    readonly year: number;
    /** 0..1, 1 being top of every grade. Null when nothing was measurable. */
    readonly strength: number | null;
    /** Teams fielded. Zero is meaningful here: the club sat the season out. */
    readonly teams: number;
}

export interface ClubBandTrend {
    readonly tier: number;
    readonly label: string;
    readonly points: readonly ClubTrendPoint[];
}

export interface ClubTrend {
    readonly overall: readonly ClubTrendPoint[];
    readonly bands: readonly ClubBandTrend[];
}
```

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { buildClubTrend } from '@/db/queries/club-trend';
import type { ResultRow } from '@/db/queries/results';

function row(over: Partial<ResultRow>): ResultRow {
    return {
        clubKey: 'matrics',
        clubName: 'Matrics',
        establishedYear: null,
        homeVenue: null,
        year: 2024,
        isFinal: true,
        source: 'playhq',
        placementBasis: 'regular_season_ladder',
        gradeKey: 'g',
        gradeName: 'B1',
        competitionKey: 'amnd',
        competitionName: 'AMND',
        tier: 5,
        teamCount: 10,
        displayName: 'Matrics',
        ladderPosition: 1,
        positionUncertain: false,
        weight: 0.6,
        played: null,
        won: null,
        drawn: null,
        lost: null,
        goalsFor: null,
        goalsAgainst: null,
        percentage: null,
        points: null,
        notes: null,
        ...over,
    };
}

describe('buildClubTrend', () => {
    it('emits a point per ranked year, including years the club missed', () => {
        const trend = buildClubTrend([row({ year: 2024 })], [2023, 2024]);
        expect(trend.overall.map((p) => p.year)).toEqual([2023, 2024]);
        expect(trend.overall[0]).toEqual({
            year: 2023,
            strength: null,
            teams: 0,
        });
        expect(trend.overall[1]?.strength).toBe(1);
        expect(trend.overall[1]?.teams).toBe(1);
    });

    it('groups bands by tier and labels them without division', () => {
        const trend = buildClubTrend(
            [
                row({ tier: 10, gradeName: 'Primary 1' }),
                row({ tier: 10, gradeName: 'Primary 2', ladderPosition: 10 }),
                row({ tier: 1, gradeName: 'Premier Division' }),
            ],
            [2024],
        );
        const primary = trend.bands.find((b) => b.tier === 10);
        expect(primary?.label).toBe('Primary');
        expect(primary?.points[0]?.teams).toBe(2);
        expect(primary?.points[0]?.strength).toBeCloseTo(0.5, 5);
    });

    it('orders bands strongest first', () => {
        const trend = buildClubTrend(
            [row({ tier: 10 }), row({ tier: 1 })],
            [2024],
        );
        expect(trend.bands.map((b) => b.tier)).toEqual([1, 10]);
    });

    it('includes position_uncertain archive rows', () => {
        const trend = buildClubTrend(
            [row({ source: 'archive_pdf', positionUncertain: true })],
            [2024],
        );
        expect(trend.overall[0]?.strength).toBe(1);
    });

    it('omits bands the club never fielded', () => {
        const trend = buildClubTrend([row({ tier: 5 })], [2024]);
        expect(trend.bands).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test run src/db/queries/club-trend.test.ts`
Expected: FAIL — cannot resolve `@/db/queries/club-trend`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { ClubBandTrend, ClubTrend, ClubTrendPoint } from '@/data/types';
import type { ResultRow } from '@/db/queries/results';
import { bandLabel } from '@/pipeline/scoring/bands';
import { meanStrength } from '@/pipeline/scoring/strength';

function pointsForYears(
    rows: readonly ResultRow[],
    years: readonly number[],
): readonly ClubTrendPoint[] {
    return years.map((year): ClubTrendPoint => {
        const yearRows = rows.filter((row) => row.year === year);
        return {
            year,
            strength: meanStrength(yearRows),
            teams: yearRows.length,
        };
    });
}

/**
 * Strength is a mean and scale is a count, so a club that sheds weak teams
 * shows strength up and scale down — the story the championship sum hides.
 */
export function buildClubTrend(
    rows: readonly ResultRow[],
    rankedYears: readonly number[],
): ClubTrend {
    const ranked = rows.filter((row) => row.isFinal);
    const tiers = [...new Set(ranked.map((row) => row.tier))].sort(
        (a, b) => a - b,
    );
    return {
        overall: pointsForYears(ranked, rankedYears),
        bands: tiers.map((tier): ClubBandTrend => ({
            tier,
            label: bandLabel(tier),
            points: pointsForYears(
                ranked.filter((row) => row.tier === tier),
                rankedYears,
            ),
        })),
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test run src/db/queries/club-trend.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire into the club profile**

In `src/db/queries/club-profile.ts`, the club's rows and `coverage.rankedYears` are already loaded. Add `trend: buildClubTrend(rows, coverage.rankedYears)` to the returned profile, and add `readonly trend: ClubTrend;` to `ClubProfile` in `src/data/types.ts`. Do not create a second query — reuse the rows already fetched.

- [ ] **Step 6: Verify against real data**

Run:

```bash
pnpm exec wrangler d1 execute netball-stats --local --command "select s.start_year, count(*) teams, round(avg((g.team_count - r.ladder_position) * 1.0 / (g.team_count - 1)), 3) strength from team_season_results r join teams t on t.id = r.team_id join clubs c on c.id = t.club_id join grades g on g.id = r.grade_id join seasons s on s.id = g.season_id where c.club_key = 'matrics' and s.is_final = 1 and g.team_count > 1 group by s.start_year order by s.start_year;"
```

Expected: one row per ranked year Matrics fielded teams, strength between 0 and 1, and the value visibly **not** tracking the team count. Record the numbers in the task report — Task 5 asserts the chart matches them.

- [ ] **Step 7: Commit**

```bash
git add src/db/queries/club-trend.ts src/db/queries/club-trend.test.ts src/db/queries/club-profile.ts src/data/types.ts
git commit -m "feat: club strength and scale trend series"
```

---

### Task 4: Trend chart on the club profile

**Files:**

- Create: `src/components/charts/trend-chart.tsx`
- Modify: `src/components/club/club-profile-page.tsx`
- Test: `src/components/charts/trend-chart.test.ts` (pure helpers only)

**Interfaces:**

- Consumes: `ClubTrend`, `ClubTrendPoint` from `@/data/types`; `timelineSlots`, `gapLabel` from `@/components/charts/timeline-slots`; scale helpers from `@/components/charts/scale`; `Coverage` for the methodology break
- Produces: `TrendChart` component taking `points`, `title`, and `gaps`

- [ ] **Step 1: Study the existing chart**

Read `src/components/charts/rank-movement-chart.tsx` end to end before writing anything. It already solves axis rendering, gap slotting, the archive→PlayHQ break, `aria-hidden` plus an `sr-only` summary, and the no-inline-`style` constraint. Match its structure; do not invent a second charting approach.

- [ ] **Step 2: Write the failing test for the pure helper**

```typescript
import { describe, expect, it } from 'vitest';
import { strengthPath } from '@/components/charts/trend-chart';

describe('strengthPath', () => {
    it('breaks the line where strength is null', () => {
        const segments = strengthPath([
            { year: 2000, strength: 0.5, teams: 3 },
            { year: 2001, strength: null, teams: 0 },
            { year: 2002, strength: 0.8, teams: 4 },
        ]);
        expect(segments).toHaveLength(2);
    });

    it('keeps consecutive measured years in one segment', () => {
        const segments = strengthPath([
            { year: 2000, strength: 0.5, teams: 3 },
            { year: 2001, strength: 0.6, teams: 3 },
        ]);
        expect(segments).toHaveLength(1);
        expect(segments[0]).toHaveLength(2);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `vp test run src/components/charts/trend-chart.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 4: Implement the helper and the component**

```typescript
export function strengthPath(
    points: readonly ClubTrendPoint[],
): readonly (readonly ClubTrendPoint[])[] {
    const segments: ClubTrendPoint[][] = [];
    let current: ClubTrendPoint[] = [];
    for (const point of points) {
        if (point.strength === null) {
            if (current.length > 0) segments.push(current);
            current = [];
            continue;
        }
        current.push(point);
    }
    if (current.length > 0) segments.push(current);
    return segments;
}
```

Render strength as a line on a fixed 0–1 y-axis (a fixed axis matters: an auto-scaled one makes small wobbles look like collapses), and teams-fielded as a faint bar strip beneath sharing the x-axis. A single-point segment must still render as a dot, or a club with one measured season shows nothing.

- [ ] **Step 5: Add to the club profile page**

Place the trend chart above the existing points-by-season chart, with a heading and this note rendered beneath it verbatim:

> Strength is the club's average finishing position across every grade it fields, where 1.00 is top of the grade. It ignores how many teams a club fields, so it answers "are our teams doing better?" — unlike the championship ranking, which rewards depth as well as performance.

Without this the club page and the ranking table read as contradicting each other.

- [ ] **Step 6: Run everything**

Run: `vp check && vp test run && vp build`
Expected: all pass.

- [ ] **Step 7: Verify in a browser**

Start `vp dev`, open `/clubs/matrics` at 1280px and at 390px. Confirm: strength line breaks across 2015 and 2017–2021 and at the archive→PlayHQ boundary; the y-axis is fixed 0–1; teams strip aligns with the line; nothing renders `0` where a dash belongs; the figures match the SQL recorded in Task 3 Step 6.

- [ ] **Step 8: Commit**

```bash
git add src/components/charts/trend-chart.tsx src/components/charts/trend-chart.test.ts src/components/club/club-profile-page.tsx
git commit -m "feat: club strength and scale trend chart"
```

---

### Task 5: Per-band breakdown

The actionable view: "up in Junior, flat in B, down in Premier".

**Files:**

- Create: `src/components/club/band-trend-grid.tsx`
- Modify: `src/components/club/club-profile-page.tsx`

**Interfaces:**

- Consumes: `ClubBandTrend` from `@/data/types`; `strengthPath` from `@/components/charts/trend-chart`

- [ ] **Step 1: Build the grid**

Small multiples: one sparkline per band, ordered strongest band first, each labelled with the band name and its latest strength value. Share the 0–1 y-axis across every sparkline so bands are visually comparable — independent axes would make a weak band look identical to a strong one. Bands the club never fielded are already omitted by Task 3.

- [ ] **Step 2: Handle the sparse case**

A band with one measured season renders a dot, not an empty box. A band whose every value is null must not render at all.

- [ ] **Step 3: Accessibility**

Sparklines are decorative given the numbers appear beside them: mark them `aria-hidden` and give each cell a text value, following the pattern in `rank-movement-chart.tsx`.

- [ ] **Step 4: Run everything**

Run: `vp check && vp test run && vp build`

- [ ] **Step 5: Verify in a browser**

Open `/clubs/matrics` and `/clubs/contax` at 1280px and 390px. The grid must reflow rather than overflow on mobile. Cross-check one band against SQL:

```bash
pnpm exec wrangler d1 execute netball-stats --local --command "select s.start_year, count(*) teams, round(avg((g.team_count - r.ladder_position) * 1.0 / (g.team_count - 1)), 3) strength from team_season_results r join teams t on t.id = r.team_id join clubs c on c.id = t.club_id join grades g on g.id = r.grade_id join seasons s on s.id = g.season_id where c.club_key = 'matrics' and s.is_final = 1 and g.tier = 5 and g.team_count > 1 group by s.start_year order by s.start_year;"
```

- [ ] **Step 6: Commit**

```bash
git add src/components/club/band-trend-grid.tsx src/components/club/club-profile-page.tsx
git commit -m "feat: per-band strength breakdown on club profile"
```

---

### Task 6: Method page documentation

**Files:**

- Modify: `src/routes/method.tsx` (or the method content component it renders)

- [ ] **Step 1: Document the metric**

Add a section stating: the formula `(team_count - ladder_position) / (team_count - 1)`; that it is averaged across every team a club fields; that it deliberately ignores squad count, unlike the championship score; that pre-2022 figures derive from Final Premiership Placings where top-4 order may reflect finals rather than the minor-round ladder, and those placings are included rather than discarded; and that win rate and games played exist only from 2022.

The site's stated posture is "free to check" — a metric nobody can reproduce fails that.

- [ ] **Step 2: Run everything**

Run: `vp check && vp test run && vp build`

- [ ] **Step 3: Commit**

```bash
git add src/routes/method.tsx
git commit -m "docs: document the strength metric on the method page"
```

---

## Out of scope

**Head-to-head, matches and premierships get their own plan.** They depend on a fixture scrape (~15,000 games), a new `matches` table and a migration, and they only cover 2022+. None of this plan depends on that work, and this plan ships useful software without it. See `~/.claude/plans/eventual-roaming-church.md` Phase B for the agreed design.

## Verification

End-to-end, after every task:

1. `vp check && vp test run && vp build` — all green.
2. `vp dev`, then `/clubs/matrics`: strength, scale and championship points all render; gaps break the lines; the archive era is marked.
3. The chart's figures reconcile with the SQL in Task 3 Step 6.
4. A club that shrank between seasons shows strength and scale moving independently — the behaviour this plan exists to expose.
5. No figure renders `0` where the underlying value is null.
