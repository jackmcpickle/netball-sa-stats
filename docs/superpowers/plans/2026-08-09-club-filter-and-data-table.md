# Club present/past filter + server-side DataTable Implementation Plan

> **STATUS: COMPLETE (as of 2026-08-12).** Shipped before the DDD refactor,
> so the unticked checkboxes below are historical, not outstanding work. The
> File Structure table points at paths that no longer exist. As built:
>
> | Plan says                                            | Actually lives at                                    |
> | ---------------------------------------------------- | ---------------------------------------------------- |
> | `src/db/queries/club-activity.ts` (`partitionClubs`) | `src/server/domain/club-directory.ts`                |
> | `src/data/types.ts`                                  | `src/server/dto/shared.dto.ts`                       |
> | `DataTable`                                          | `src/components/ui/data-table.tsx`                   |
> | `SegmentedToggle`                                    | `src/components/ui/toggle.tsx`                       |
> | `resolveTableState`                                  | `src/server/domain/table-query.ts` (as `TableQuery`) |
> | `tableSearchSchema`                                  | `src/routes/-table-params.ts`                        |
>
> Since 2026-08-12 the tables sort and slice in SQL rather than in memory —
> see `TableQuery#page`. `resolveTableState` is no longer exported.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide clubs with no rank in the latest championship year behind a toggle, and move every tabular list onto one generic, server-sorted, server-paginated table component.

**Architecture:** Two independent slices of `docs/superpowers/specs/2026-08-09-head-to-head-design.md` (§5 and §6) that need no new data. A pure `partitionClubs` helper feeds both the clubs index and (later) the head-to-head pickers. A presentational `DataTable` wraps `@tanstack/react-table` in manual mode over the existing `TableFrame`/`Th`/`Td` primitives; sort and page state live in URL search params and drive `orderBy`/`limit`/`offset` in drizzle.

**Tech Stack:** TanStack Start + Router, TanStack Table (new), drizzle-orm on D1, zod, Tailwind v4, Base UI, vitest.

## Global Constraints

- Package manager and task runner is `vp` (Vite+). Validate with `vp check` and `vp test`. Never invoke `npm`/`vitest` directly.
- Data access goes through `src/data/index.ts` only; route loaders never import from `src/db/*`.
- Route loaders use `createServerFn({ method: 'GET' })` with a zod `.validator`, and fall back to valid defaults rather than throwing on a bad search param.
- String literals in JSX are wrapped in braces: `{'Present clubs'}`.
- Styling uses existing tokens only: `text-ink`, `text-ink-body`, `text-ink-muted`, `bg-paper`, `bg-paper-sunken`, `bg-paper-alt`, `border-rule`, `rounded-card`, `.numeric`, `.label-mono`.
- No bitwise operators (existing lint rule — see `src/db/queries/clubs.ts`).
- Default page size is **50**; `pageSize` is clamped to the allow-list `[25, 50, 100]`.
- Aggregation logic lives in pure, DOM-free functions under `src/db/queries/`, tested directly. Components stay presentational.
- Branch is `feature/head-to-head`. Commit after every task.

## File Structure

| File                                                      | Responsibility                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/db/queries/club-activity.ts` (create)                | Pure `partitionClubs` — splits clubs into present/past given the ranked key set.                   |
| `src/db/queries/club-activity.test.ts` (create)           | Unit tests for the above.                                                                          |
| `src/db/queries/pagination.ts` (create)                   | Pure `resolveTableState` — validates sort column, direction, page, pageSize against an allow-list. |
| `src/db/queries/pagination.test.ts` (create)              | Unit tests for the above.                                                                          |
| `src/components/ui/toggle.tsx` (create)                   | Segmented two-option control on Base UI.                                                           |
| `src/components/ui/data-table.tsx` (create)               | Generic presentational table: TanStack Table in manual mode over existing primitives.              |
| `src/components/ui/data-table.test.tsx` (create)          | Header `aria-sort`, pagination visibility, `onChange` payloads.                                    |
| `src/routes/-table-params.ts` (create)                    | Shared zod fragment + `loaderDeps` helper for `sort`/`dir`/`page`/`pageSize`.                      |
| `src/routes/clubs.index.tsx` (modify)                     | Adds `includePast` search param; supplies `lastRankedYear` per club.                               |
| `src/components/club/club-index-page.tsx` (modify)        | Toggle, count, recessed past-club cards.                                                           |
| `src/components/ladders/ladders-page.tsx` (modify)        | Ladder table moves onto `DataTable`.                                                               |
| `src/components/rankings/championship-table.tsx` (modify) | Championship table moves onto `DataTable`.                                                         |
| `src/components/club/club-results-table.tsx` (modify)     | Club results table moves onto `DataTable`.                                                         |

---

### Task 1: `partitionClubs` helper

**Files:**

- Create: `src/db/queries/club-activity.ts`
- Test: `src/db/queries/club-activity.test.ts`

**Interfaces:**

- Consumes: `Club` from `@/data/types` (`{ key, name, establishedYear, homeVenue, accent }`).
- Produces: `partitionClubs(clubs, rankedClubKeys): ClubPartition` where
  `ClubPartition = { present: readonly Club[]; past: readonly Club[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/db/queries/club-activity.test.ts
import { describe, expect, it } from 'vitest';
import { partitionClubs } from '@/db/queries/club-activity';
import type { Club } from '@/data/types';

function club(key: string): Club {
    return {
        key,
        name: key,
        establishedYear: null,
        homeVenue: null,
        accent: 'pink',
    };
}

describe('partitionClubs', () => {
    it('splits clubs by presence in the ranked key set', () => {
        const result = partitionClubs(
            [club('contax'), club('brahma')],
            new Set(['contax']),
        );
        expect(result.present.map((c) => c.key)).toEqual(['contax']);
        expect(result.past.map((c) => c.key)).toEqual(['brahma']);
    });

    it('preserves the incoming order within each group', () => {
        const result = partitionClubs(
            [club('a'), club('b'), club('c'), club('d')],
            new Set(['b', 'd']),
        );
        expect(result.present.map((c) => c.key)).toEqual(['b', 'd']);
        expect(result.past.map((c) => c.key)).toEqual(['a', 'c']);
    });

    it('treats every club as past when nothing is ranked', () => {
        const result = partitionClubs([club('a'), club('b')], new Set());
        expect(result.present).toEqual([]);
        expect(result.past).toHaveLength(2);
    });

    it('ignores ranked keys with no matching club', () => {
        const result = partitionClubs([club('a')], new Set(['a', 'ghost']));
        expect(result.present.map((c) => c.key)).toEqual(['a']);
        expect(result.past).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/db/queries/club-activity.test.ts`
Expected: FAIL — cannot resolve `@/db/queries/club-activity`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/db/queries/club-activity.ts
import type { Club } from '@/data/types';

export interface ClubPartition {
    readonly present: readonly Club[];
    readonly past: readonly Club[];
}

/**
 * A club is "present" when it holds a championship rank in the latest ranked
 * year — the same fact the club card already prints. Ranked keys with no club
 * are ignored rather than fabricated: the club list is the authority on which
 * clubs exist.
 */
export function partitionClubs(
    clubs: readonly Club[],
    rankedClubKeys: ReadonlySet<string>,
): ClubPartition {
    const present: Club[] = [];
    const past: Club[] = [];
    for (const club of clubs) {
        if (rankedClubKeys.has(club.key)) {
            present.push(club);
        } else {
            past.push(club);
        }
    }
    return { present, past };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/db/queries/club-activity.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/queries/club-activity.ts src/db/queries/club-activity.test.ts
git commit -m "feat: partition clubs into present and past"
```

---

### Task 2: Segmented toggle primitive

**Files:**

- Create: `src/components/ui/toggle.tsx`

**Interfaces:**

- Produces: `<SegmentedToggle label value options onValueChange />` where
  `options: readonly { value: boolean; label: string }[]`.

- [ ] **Step 1: Write the component**

Model the markup on `src/components/ui/select.tsx` (same label treatment and token set). Two `<button>`s inside a `role="group"`, the active one carrying `aria-pressed="true"`. No Base UI dependency is needed for two buttons — Base UI's Select exists for popover behaviour this control does not have.

```tsx
// src/components/ui/toggle.tsx
import type { JSX } from 'react';

export interface ToggleOption {
    readonly value: boolean;
    readonly label: string;
}

/**
 * Two mutually exclusive buttons rather than a checkbox: both states are named,
 * so "All clubs (incl. past)" never has to be inferred from an unchecked box.
 */
export function SegmentedToggle({
    label,
    value,
    options,
    hint,
    onValueChange,
}: {
    readonly label: string;
    readonly value: boolean;
    readonly options: readonly ToggleOption[];
    readonly hint?: string;
    readonly onValueChange: (next: boolean) => void;
}): JSX.Element {
    return (
        <div className="flex flex-col gap-1.5">
            <span
                className="label-mono text-ink-muted"
                id={`toggle-${label}`}
            >
                {label}
            </span>
            <div
                role="group"
                aria-labelledby={`toggle-${label}`}
                className="inline-flex rounded-card border border-rule bg-paper p-0.5"
            >
                {options.map((option) => (
                    <button
                        key={String(option.value)}
                        type="button"
                        aria-pressed={option.value === value}
                        onClick={() => {
                            onValueChange(option.value);
                        }}
                        className={`rounded-card px-3 py-1.5 text-sm ${
                            option.value === value
                                ? 'bg-paper-sunken font-semibold text-ink'
                                : 'text-ink-muted'
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            {hint !== undefined && (
                <span className="text-[13px] text-ink-muted">{hint}</span>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `vp check`
Expected: PASS, no type or lint errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/toggle.tsx
git commit -m "feat: segmented toggle primitive"
```

---

### Task 3: Clubs index hides past clubs by default

**Files:**

- Modify: `src/routes/clubs.index.tsx`
- Modify: `src/components/club/club-index-page.tsx`

**Interfaces:**

- Consumes: `partitionClubs` (Task 1), `SegmentedToggle` (Task 2), existing
  `getChampionshipSeason`, `latestRankedYear`, `listClubs` from `@/data`.
- Produces: `ClubIndexEntry` gains `readonly lastRankedYear: number | null`;
  `ClubIndexData` gains `readonly includePast: boolean` and
  `readonly presentCount: number`.

- [ ] **Step 1: Add the data function for last ranked year**

`src/data/index.ts` — add below `getChampionshipSeason`:

```ts
/**
 * Latest year each club held a championship rank. Drives the "last ranked 2016"
 * line on past-club cards, which answers the question a bare dash provokes.
 */
export async function lastRankedYears(): Promise<ReadonlyMap<string, number>> {
    const history = await fetchChampionshipHistory(getDb());
    const latest = new Map<string, number>();
    for (const season of history) {
        for (const row of season.rows) {
            const seen = latest.get(row.club.key);
            if (seen === undefined || season.year > seen) {
                latest.set(row.club.key, season.year);
            }
        }
    }
    return latest;
}
```

- [ ] **Step 2: Rewrite the route loader**

`src/routes/clubs.index.tsx` — replace the file body:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ClubIndexPage } from '@/components/club/club-index-page';
import {
    getChampionshipSeason,
    lastRankedYears,
    latestRankedYear,
    listClubs,
} from '@/data';
import type { Club } from '@/data/types';
import { partitionClubs } from '@/db/queries/club-activity';

export interface ClubIndexEntry {
    readonly club: Club;
    readonly rank: number | null;
    readonly points: number | null;
    readonly teams: number | null;
    readonly lastRankedYear: number | null;
}

export interface ClubIndexData {
    readonly year: number;
    readonly includePast: boolean;
    readonly presentCount: number;
    readonly totalCount: number;
    readonly entries: readonly ClubIndexEntry[];
}

const searchSchema = z.object({
    includePast: z.coerce.boolean().optional(),
});

const loadClubs = createServerFn({ method: 'GET' })
    .validator(z.object({ includePast: z.boolean().optional() }))
    .handler(async ({ data }): Promise<ClubIndexData> => {
        const includePast = data.includePast ?? false;
        const year = await latestRankedYear();
        const [season, clubs, lastRanked] = await Promise.all([
            getChampionshipSeason(year),
            listClubs(),
            lastRankedYears(),
        ]);
        const rankedKeys = new Set(
            (season?.rows ?? []).map((row) => row.club.key),
        );
        const { present, past } = partitionClubs(clubs, rankedKeys);
        const visible = includePast ? [...present, ...past] : present;
        return {
            year,
            includePast,
            presentCount: present.length,
            totalCount: clubs.length,
            entries: visible.map((club) => {
                const row = season?.rows.find(
                    (entry) => entry.club.key === club.key,
                );
                return {
                    club,
                    rank: row?.rank ?? null,
                    points: row?.points ?? null,
                    teams: row?.teams ?? null,
                    lastRankedYear: lastRanked.get(club.key) ?? null,
                };
            }),
        };
    });

export const Route = createFileRoute('/clubs/')({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({ includePast: search.includePast }),
    loader: async ({ deps }) =>
        loadClubs({ data: { includePast: deps.includePast } }),
    component: ClubIndexPage,
});
```

Note the visible list keeps present clubs first, then past — so turning the
toggle on appends rather than reshuffling, and a club never moves under the
cursor.

- [ ] **Step 3: Wire the toggle into the page**

`src/components/club/club-index-page.tsx` — add above the grid, and change the
per-card rank line so a card with `rank === null` renders
`{`last ranked ${String(entry.lastRankedYear)}`}` when `lastRankedYear` is not
null, falling back to the existing "not ranked in {year}" text when it is.
Past cards render the club name in `text-ink-muted` and the accent dot with
`bg-transparent border border-current` instead of `bg-current`.

```tsx
const onTogglePast = useCallback(
    (includePast: boolean) => {
        void navigate({
            search: (previous) => ({ ...previous, includePast }),
            resetScroll: false,
        });
    },
    [navigate],
);

<SegmentedToggle
    label="Clubs shown"
    value={data.includePast}
    hint={`Showing ${String(data.entries.length)} of ${String(data.totalCount)} clubs`}
    options={[
        { value: false, label: 'Present clubs' },
        { value: true, label: 'All clubs (incl. past)' },
    ]}
    onValueChange={onTogglePast}
/>;
```

The page component needs `getRouteApi('/clubs/').useNavigate()` alongside its
existing `useLoaderData()`, matching `ladders-page.tsx`.

- [ ] **Step 4: Update the page copy**

Replace the intro paragraph with: ranks are from the latest championship season,
clubs no longer competing are hidden by default, open a club for its full record.
Keep it to two sentences.

- [ ] **Step 5: Verify**

Run: `vp check && vp test`
Expected: PASS.

Then `vp dev` and confirm by hand: `/clubs` shows only ranked clubs;
`/clubs?includePast=true` shows all, with past cards recessed and reading
"last ranked <year>"; the count hint matches; browser back returns to the
filtered view.

- [ ] **Step 6: Commit**

```bash
git add src/routes/clubs.index.tsx src/components/club/club-index-page.tsx src/data/index.ts
git commit -m "feat: hide past clubs on the club index behind a toggle"
```

---

### Task 4: Table state validation helper

**Files:**

- Create: `src/db/queries/pagination.ts`
- Test: `src/db/queries/pagination.test.ts`

**Interfaces:**

- Produces:

    ```ts
    interface TableState { sort: string; desc: boolean; page: number; pageSize: number }
    interface TableSpec { sortable: readonly string[]; defaultSort: string; defaultDesc: boolean }
    resolveTableState(raw: Partial<RawTableState>, spec: TableSpec): TableState
    offsetFor(state: TableState): number
    pageCount(totalRows: number, pageSize: number): number
    const PAGE_SIZES: readonly [25, 50, 100]
    const DEFAULT_PAGE_SIZE = 50
    ```

- [ ] **Step 1: Write the failing test**

```ts
// src/db/queries/pagination.test.ts
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PAGE_SIZE,
    offsetFor,
    pageCount,
    resolveTableState,
} from '@/db/queries/pagination';

const spec = {
    sortable: ['year', 'points'],
    defaultSort: 'year',
    defaultDesc: true,
} as const;

describe('resolveTableState', () => {
    it('defaults everything when nothing is supplied', () => {
        expect(resolveTableState({}, spec)).toEqual({
            sort: 'year',
            desc: true,
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
        });
    });

    it('rejects a sort column outside the allow-list', () => {
        // Column ids reach drizzle's orderBy, so an unknown one must never pass through.
        expect(
            resolveTableState({ sort: 'points; drop table' }, spec).sort,
        ).toBe('year');
    });

    it('accepts an allowed sort column and direction', () => {
        expect(resolveTableState({ sort: 'points', dir: 'asc' }, spec)).toEqual(
            {
                sort: 'points',
                desc: false,
                page: 1,
                pageSize: DEFAULT_PAGE_SIZE,
            },
        );
    });

    it('clamps page size to the allow-list', () => {
        expect(resolveTableState({ pageSize: 100 }, spec).pageSize).toBe(100);
        expect(resolveTableState({ pageSize: 5000 }, spec).pageSize).toBe(
            DEFAULT_PAGE_SIZE,
        );
    });

    it('floors page at 1', () => {
        expect(resolveTableState({ page: 0 }, spec).page).toBe(1);
        expect(resolveTableState({ page: -3 }, spec).page).toBe(1);
    });
});

describe('offsetFor', () => {
    it('is zero on the first page', () => {
        expect(
            offsetFor({ sort: 'year', desc: true, page: 1, pageSize: 50 }),
        ).toBe(0);
    });

    it('steps by page size', () => {
        expect(
            offsetFor({ sort: 'year', desc: true, page: 3, pageSize: 50 }),
        ).toBe(100);
    });
});

describe('pageCount', () => {
    it('rounds up a partial final page', () => {
        expect(pageCount(101, 50)).toBe(3);
    });

    it('is one page when empty, so the UI never shows "page 1 of 0"', () => {
        expect(pageCount(0, 50)).toBe(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/db/queries/pagination.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/db/queries/pagination.ts

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

export interface TableState {
    readonly sort: string;
    readonly desc: boolean;
    readonly page: number;
    readonly pageSize: number;
}

export interface RawTableState {
    readonly sort?: string;
    readonly dir?: string;
    readonly page?: number;
    readonly pageSize?: number;
}

export interface TableSpec {
    /** Column ids that may reach `orderBy`. Anything else falls back. */
    readonly sortable: readonly string[];
    readonly defaultSort: string;
    readonly defaultDesc: boolean;
}

/**
 * Search params are attacker-controlled and the sort column reaches drizzle's
 * `orderBy`, so it is matched against an allow-list rather than sanitised.
 * Everything unrecognised silently falls back — a hostile URL gets the default
 * view, not a 500.
 */
export function resolveTableState(
    raw: RawTableState,
    spec: TableSpec,
): TableState {
    const sort =
        raw.sort !== undefined && spec.sortable.includes(raw.sort)
            ? raw.sort
            : spec.defaultSort;
    const desc =
        raw.dir === 'asc'
            ? false
            : raw.dir === 'desc'
              ? true
              : spec.defaultDesc;
    const page =
        raw.page !== undefined && Number.isInteger(raw.page) && raw.page > 0
            ? raw.page
            : 1;
    const pageSize =
        PAGE_SIZES.find((size) => size === raw.pageSize) ?? DEFAULT_PAGE_SIZE;
    return { sort, desc, page, pageSize };
}

export function offsetFor(state: TableState): number {
    return (state.page - 1) * state.pageSize;
}

export function pageCount(totalRows: number, pageSize: number): number {
    return Math.max(1, Math.ceil(totalRows / pageSize));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/db/queries/pagination.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/queries/pagination.ts src/db/queries/pagination.test.ts
git commit -m "feat: validated table sort and pagination state"
```

---

### Task 5: Shared route search-param fragment

**Files:**

- Create: `src/routes/-table-params.ts`

**Interfaces:**

- Consumes: `parseOptionalIntParam` from `@/routes/-search-params`.
- Produces: `tableSearchSchema` (a zod object with `sort`, `dir`, `page`,
  `pageSize`) and `tableSearchDeps(search)` returning
  `{ sort?, dir?, page?, pageSize? }` for `loaderDeps`.

- [ ] **Step 1: Write the module**

```ts
// src/routes/-table-params.ts
import { z } from 'zod';
import { parseOptionalIntParam } from '@/routes/-search-params';

/**
 * Shared by every paginated route so sort/page URLs read the same everywhere.
 * Values are only shape-checked here; `resolveTableState` does the allow-list
 * validation server-side, because the allow-list is per-table.
 */
export const tableSearchSchema = z.object({
    sort: z.string().optional(),
    dir: z.enum(['asc', 'desc']).optional(),
    page: z.preprocess(parseOptionalIntParam, z.number().int().optional()),
    pageSize: z.preprocess(parseOptionalIntParam, z.number().int().optional()),
});

export type TableSearch = z.infer<typeof tableSearchSchema>;

export function tableSearchDeps(search: TableSearch): TableSearch {
    return {
        sort: search.sort,
        dir: search.dir,
        page: search.page,
        pageSize: search.pageSize,
    };
}
```

- [ ] **Step 2: Verify**

Run: `vp check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/-table-params.ts
git commit -m "feat: shared table search params"
```

---

### Task 6: Generic DataTable component

**Files:**

- Modify: `package.json` (add `@tanstack/react-table`)
- Create: `src/components/ui/data-table.tsx`
- Test: `src/components/ui/data-table.test.tsx`

**Interfaces:**

- Consumes: `TableFrame`, `Table`, `Th`, `Td`, `Tr` from `@/components/ui/table`;
  `TableState`, `pageCount`, `PAGE_SIZES` from `@/db/queries/pagination`.
- Produces:

    ```ts
    interface DataTableColumn<T> {
        id: string;
        header: string;
        align?: 'left' | 'right' | 'center';
        sortable?: boolean;
        emphasis?: 'normal' | 'strong' | 'quiet';
        cell: (row: T) => ReactNode;
    }
    <DataTable<T>
        caption={string}
        columns={readonly DataTableColumn<T>[]}
        rows={readonly T[]}
        rowKey={(row: T) => string}
        totalRows={number}
        state={TableState}
        onChange={(next: TableState) => void}
        highlightRow={(row: T) => boolean}   // optional
    />
    ```

- [ ] **Step 1: Add the dependency**

```bash
vp add @tanstack/react-table
```

Expected: `package.json` gains `@tanstack/react-table` under `dependencies`.

- [ ] **Step 2: Write the failing test**

```tsx
// src/components/ui/data-table.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from '@/components/ui/data-table';

interface Row {
    readonly id: string;
    readonly year: number;
}

const columns = [
    { id: 'id', header: 'ID', cell: (row: Row) => row.id },
    {
        id: 'year',
        header: 'YEAR',
        sortable: true,
        align: 'right' as const,
        cell: (row: Row) => row.year,
    },
];

const state = { sort: 'year', desc: true, page: 1, pageSize: 25 };

function rows(count: number): Row[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `r${String(i)}`,
        year: 2000 + i,
    }));
}

describe('DataTable', () => {
    it('marks the sorted column with aria-sort and leaves others none', () => {
        render(
            <DataTable
                caption="Test"
                columns={columns}
                rows={rows(2)}
                rowKey={(row) => row.id}
                totalRows={2}
                state={state}
                onChange={vi.fn()}
            />,
        );
        expect(
            screen.getByRole('columnheader', { name: /YEAR/ }),
        ).toHaveAttribute('aria-sort', 'descending');
        expect(
            screen.getByRole('columnheader', { name: /ID/ }),
        ).toHaveAttribute('aria-sort', 'none');
    });

    it('flips direction when the sorted column is clicked again', async () => {
        const onChange = vi.fn();
        render(
            <DataTable
                caption="Test"
                columns={columns}
                rows={rows(2)}
                rowKey={(row) => row.id}
                totalRows={2}
                state={state}
                onChange={onChange}
            />,
        );
        await userEvent.click(screen.getByRole('button', { name: /YEAR/ }));
        expect(onChange).toHaveBeenCalledWith({
            ...state,
            desc: false,
            page: 1,
        });
    });

    it('resets to page 1 when the sort column changes', async () => {
        const onChange = vi.fn();
        render(
            <DataTable
                caption="Test"
                columns={columns}
                rows={rows(2)}
                rowKey={(row) => row.id}
                totalRows={200}
                state={{ ...state, page: 4 }}
                onChange={onChange}
            />,
        );
        await userEvent.click(screen.getByRole('button', { name: /YEAR/ }));
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ page: 1 }),
        );
    });

    it('hides pagination when every row fits on one page', () => {
        render(
            <DataTable
                caption="Test"
                columns={columns}
                rows={rows(12)}
                rowKey={(row) => row.id}
                totalRows={12}
                state={state}
                onChange={vi.fn()}
            />,
        );
        expect(
            screen.queryByRole('navigation', { name: /pagination/i }),
        ).toBeNull();
    });

    it('shows pagination and reports the next page', async () => {
        const onChange = vi.fn();
        render(
            <DataTable
                caption="Test"
                columns={columns}
                rows={rows(25)}
                rowKey={(row) => row.id}
                totalRows={80}
                state={state}
                onChange={onChange}
            />,
        );
        await userEvent.click(screen.getByRole('button', { name: /next/i }));
        expect(onChange).toHaveBeenCalledWith({ ...state, page: 2 });
    });

    it('does not sort rows itself — it renders them in the given order', () => {
        render(
            <DataTable
                caption="Test"
                columns={columns}
                rows={[
                    { id: 'b', year: 1990 },
                    { id: 'a', year: 2020 },
                ]}
                rowKey={(row) => row.id}
                totalRows={2}
                state={state}
                onChange={vi.fn()}
            />,
        );
        const cells = screen.getAllByRole('cell');
        expect(cells[0]).toHaveTextContent('b');
    });
});
```

If `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`
and `jsdom` are not already dev dependencies, add them and set
`test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] }` in
`vite.config.ts`, with `src/test-setup.ts` containing
`import '@testing-library/jest-dom/vitest';`.

- [ ] **Step 3: Run test to verify it fails**

Run: `vp test src/components/ui/data-table.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```tsx
// src/components/ui/data-table.tsx
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
} from '@tanstack/react-table';
import type { JSX, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import {
    Table,
    TableFrame,
    Td,
    Th,
    Tr,
    type Align,
} from '@/components/ui/table';
import { pageCount, type TableState } from '@/db/queries/pagination';

export interface DataTableColumn<T> {
    readonly id: string;
    readonly header: string;
    readonly align?: Align;
    readonly sortable?: boolean;
    readonly emphasis?: 'normal' | 'strong' | 'quiet';
    readonly cell: (row: T) => ReactNode;
}

/**
 * Presentational only. TanStack Table runs in manual mode — it supplies column
 * and header plumbing but never sorts or slices, because the client holds one
 * page and the server has already ordered it. Sorting client-side here would
 * silently reorder 50 rows out of 4000 and look correct while being wrong.
 */
export function DataTable<T>({
    caption,
    columns,
    rows,
    rowKey,
    totalRows,
    state,
    onChange,
    highlightRow,
}: {
    readonly caption: string;
    readonly columns: readonly DataTableColumn<T>[];
    readonly rows: readonly T[];
    readonly rowKey: (row: T) => string;
    readonly totalRows: number;
    readonly state: TableState;
    readonly onChange: (next: TableState) => void;
    readonly highlightRow?: (row: T) => boolean;
}): JSX.Element {
    const columnDefs = useMemo<ColumnDef<T>[]>(
        () =>
            columns.map((column) => ({
                id: column.id,
                header: column.header,
                cell: (context) => column.cell(context.row.original),
            })),
        [columns],
    );

    const table = useReactTable({
        data: rows as T[],
        columns: columnDefs,
        getCoreRowModel: getCoreRowModel(),
        manualSorting: true,
        manualPagination: true,
        rowCount: totalRows,
    });

    const onSort = useCallback(
        (id: string) => {
            // Re-clicking the active column flips direction; a new column starts
            // descending and resets to page 1, because page 4 of the old sort
            // is meaningless under the new one.
            onChange(
                id === state.sort
                    ? { ...state, desc: !state.desc, page: 1 }
                    : { ...state, sort: id, desc: true, page: 1 },
            );
        },
        [onChange, state],
    );

    const pages = pageCount(totalRows, state.pageSize);
    const showPagination = totalRows > state.pageSize;

    return (
        <>
            <TableFrame>
                <Table caption={caption}>
                    <thead>
                        <tr>
                            {columns.map((column) => (
                                <Th
                                    key={column.id}
                                    align={column.align}
                                    ariaSort={
                                        column.sortable === true &&
                                        column.id === state.sort
                                            ? state.desc
                                                ? 'descending'
                                                : 'ascending'
                                            : 'none'
                                    }
                                >
                                    {column.sortable === true ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onSort(column.id);
                                            }}
                                            className="label-mono inline-flex items-center gap-1 text-ink-muted hover:text-ink"
                                        >
                                            {column.header}
                                            <span aria-hidden="true">
                                                {column.id === state.sort
                                                    ? state.desc
                                                        ? '↓'
                                                        : '↑'
                                                    : '↕'}
                                            </span>
                                        </button>
                                    ) : (
                                        column.header
                                    )}
                                </Th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.map((row, index) => (
                            <Tr
                                key={rowKey(row.original)}
                                index={index}
                                highlight={
                                    highlightRow?.(row.original) ?? false
                                }
                            >
                                {row
                                    .getVisibleCells()
                                    .map((cell, cellIndex) => (
                                        <Td
                                            key={cell.id}
                                            align={columns[cellIndex].align}
                                            emphasis={
                                                columns[cellIndex].emphasis
                                            }
                                        >
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </Td>
                                    ))}
                            </Tr>
                        ))}
                    </tbody>
                </Table>
            </TableFrame>
            {showPagination && (
                <nav
                    aria-label="Pagination"
                    className="mt-4 flex items-center justify-between gap-4"
                >
                    <p className="text-[13px] text-ink-muted">
                        {`Page ${String(state.page)} of ${String(pages)} · ${String(totalRows)} rows`}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={state.page <= 1}
                            onClick={() => {
                                onChange({ ...state, page: state.page - 1 });
                            }}
                            className="rounded-card border border-rule px-3 py-1.5 text-sm text-ink disabled:text-ink-muted"
                        >
                            {'Previous'}
                        </button>
                        <button
                            type="button"
                            disabled={state.page >= pages}
                            onClick={() => {
                                onChange({ ...state, page: state.page + 1 });
                            }}
                            className="rounded-card border border-rule px-3 py-1.5 text-sm text-ink disabled:text-ink-muted"
                        >
                            {'Next'}
                        </button>
                    </div>
                </nav>
            )}
        </>
    );
}
```

- [ ] **Step 5: Extend `Th` to carry `aria-sort`**

`src/components/ui/table.tsx` — add an optional prop, defaulting to omitted so
every existing caller is unaffected:

```tsx
export function Th({
    children,
    align = 'left',
    scope = 'col',
    ariaSort,
}: {
    readonly children: ReactNode;
    readonly align?: Align;
    readonly scope?: 'col' | 'row';
    /** Announced by screen readers; an arrow glyph alone conveys nothing. */
    readonly ariaSort?: 'ascending' | 'descending' | 'none';
}): JSX.Element {
    return (
        <th
            scope={scope}
            aria-sort={ariaSort}
            className={`label-mono bg-paper-sunken px-2.5 py-3 font-medium first:pl-4 last:pr-4 sm:px-3 sm:py-3.5 sm:first:pl-6 sm:last:pr-6 ${ALIGN[align]}`}
        >
            {children}
        </th>
    );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `vp test src/components/ui/data-table.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/data-table.tsx src/components/ui/data-table.test.tsx src/components/ui/table.tsx
git commit -m "feat: generic server-driven DataTable"
```

---

### Task 7: Championship table on DataTable

**Files:**

- Modify: `src/db/queries/championship.ts`
- Modify: `src/data/index.ts`
- Modify: `src/routes/index.tsx`
- Modify: `src/components/rankings/championship-table.tsx`

**Interfaces:**

- Consumes: `resolveTableState`, `offsetFor` (Task 4), `tableSearchSchema`,
  `tableSearchDeps` (Task 5), `DataTable` (Task 6).
- Produces: `getChampionshipSeason` gains an optional second argument
  `state?: RawTableState` and its result gains
  `readonly totalRows: number` plus `readonly tableState: TableState`.

- [ ] **Step 1: Read the current query and table**

Run: `cat src/db/queries/championship.ts src/components/rankings/championship-table.tsx`

The championship rows are computed from weighted results, so ordering and
slicing happen after aggregation in TypeScript rather than in SQL. Sort and
paginate the aggregated array — the aggregation reads one season, which is
bounded, so this stays honest to "server-side" (it runs in the Worker, and the
client receives one page).

- [ ] **Step 2: Add the sortable column spec**

In `src/db/queries/championship.ts`:

```ts
export const CHAMPIONSHIP_TABLE_SPEC = {
    sortable: ['rank', 'club', 'points', 'teams'],
    defaultSort: 'rank',
    defaultDesc: false,
} as const;

/**
 * Every sort gets `rank` as a tiebreaker. Without one, rows with equal points
 * can swap between requests and the same club appears on two pages — or on
 * none.
 */
export function sortChampionshipRows(
    rows: readonly ChampionshipRow[],
    state: TableState,
): readonly ChampionshipRow[] {
    const direction = state.desc ? -1 : 1;
    return [...rows].sort((a, b) => {
        const primary =
            state.sort === 'club'
                ? a.club.name.localeCompare(b.club.name)
                : state.sort === 'points'
                  ? a.points - b.points
                  : state.sort === 'teams'
                    ? a.teams - b.teams
                    : a.rank - b.rank;
        return primary === 0 ? a.rank - b.rank : primary * direction;
    });
}
```

- [ ] **Step 3: Write the failing test**

```ts
// src/db/queries/championship.test.ts — append
describe('sortChampionshipRows', () => {
    it('breaks ties on rank so paging is stable', () => {
        const rows = [
            { rank: 3, points: 10, teams: 5, club: { name: 'C', key: 'c' } },
            { rank: 1, points: 10, teams: 5, club: { name: 'A', key: 'a' } },
            { rank: 2, points: 10, teams: 5, club: { name: 'B', key: 'b' } },
        ] as ChampionshipRow[];
        const sorted = sortChampionshipRows(rows, {
            sort: 'points',
            desc: true,
            page: 1,
            pageSize: 50,
        });
        expect(sorted.map((row) => row.rank)).toEqual([1, 2, 3]);
    });

    it('sorts by club name ascending', () => {
        const rows = [
            { rank: 1, points: 10, teams: 5, club: { name: 'Zed', key: 'z' } },
            { rank: 2, points: 9, teams: 4, club: { name: 'Ace', key: 'a' } },
        ] as ChampionshipRow[];
        const sorted = sortChampionshipRows(rows, {
            sort: 'club',
            desc: false,
            page: 1,
            pageSize: 50,
        });
        expect(sorted[0].club.name).toBe('Ace');
    });
});
```

- [ ] **Step 4: Run it, watch it fail, implement, watch it pass**

Run: `vp test src/db/queries/championship.test.ts`
Expected: FAIL then PASS after Step 2's code is in place.

- [ ] **Step 5: Thread state through the route**

`src/routes/index.tsx` — add `validateSearch: tableSearchSchema`,
`loaderDeps: ({ search }) => tableSearchDeps(search)`, pass the raw state into
the server fn, and inside the handler call
`resolveTableState(raw, CHAMPIONSHIP_TABLE_SPEC)`, then
`sortChampionshipRows(...).slice(offsetFor(state), offsetFor(state) + state.pageSize)`.
Return `totalRows` as the pre-slice length and `tableState` as the resolved state.

- [ ] **Step 6: Swap the markup**

`src/components/rankings/championship-table.tsx` — replace the hand-rolled
`<thead>`/`<tbody>` with `<DataTable>`, moving each existing `<Th>`/`<Td>` pair
into a `DataTableColumn` with the same `align` and `emphasis` values, marking
rank/club/points/teams `sortable: true`. `onChange` navigates:

```tsx
const onTableChange = useCallback(
    (next: TableState) => {
        void navigate({
            search: (previous) => ({
                ...previous,
                sort: next.sort,
                dir: next.desc ? 'desc' : 'asc',
                page: next.page,
                pageSize: next.pageSize,
            }),
            resetScroll: false,
        });
    },
    [navigate],
);
```

- [ ] **Step 7: Verify**

Run: `vp check && vp test`
Then `vp dev`: sort by points, confirm the URL updates, reload and confirm the
sort survives, page forward and back, and confirm no club appears twice across
consecutive pages.

- [ ] **Step 8: Commit**

```bash
git add -A src/db/queries/championship.ts src/db/queries/championship.test.ts src/routes/index.tsx src/components/rankings/championship-table.tsx src/data/index.ts
git commit -m "feat: sortable paginated championship table"
```

---

### Task 8: Ladders and club results tables on DataTable

**Files:**

- Modify: `src/components/ladders/ladders-page.tsx`
- Modify: `src/routes/ladders.tsx`
- Modify: `src/components/club/club-results-table.tsx`
- Modify: `src/routes/clubs.$clubKey.tsx`
- Modify: `src/db/queries/grades.ts`
- Modify: `src/db/queries/club-profile.ts`

**Interfaces:**

- Consumes: everything from Tasks 4–6.
- Produces: `LADDER_TABLE_SPEC` (`sortable: ['position','team','played','won','lost','drawn','goalsFor','goalsAgainst','percentage','points']`, default `position` ascending) and `CLUB_RESULTS_TABLE_SPEC` (`sortable: ['year','grade','position','played','won','lost','points']`, default `year` descending).

- [ ] **Step 1: Ladders — add ordering in SQL**

In `src/db/queries/grades.ts`, `fetchLadder` gains a `state: TableState`
parameter and maps each allowed column id onto a drizzle column, applying
`asc`/`desc` plus `asc(teamSeasonResults.ladderPosition)` as the tiebreaker,
then `.limit(state.pageSize).offset(offsetFor(state))`. A sibling
`count()` select over the same `where` supplies `totalRows`.

A ladder is at most ~14 rows, so pagination furniture will not render — but the
sorting is real and the query is paginated, so a future oversized grade cannot
blow up the page.

- [ ] **Step 2: Ladders — extend the route**

`src/routes/ladders.tsx` — merge `tableSearchSchema` into the existing
`searchSchema` (`searchSchema.merge(tableSearchSchema)`), extend `loaderDeps`
to spread `tableSearchDeps(search)`, and resolve with `LADDER_TABLE_SPEC`.
Changing year or grade must reset `page` to 1 in the page component's existing
`onYearChange` / `onGradeChange` handlers — page 3 of the previous grade is not
a meaningful destination.

- [ ] **Step 3: Ladders — swap the markup**

Convert the ten `<Th>`/`<Td>` pairs in `ladders-page.tsx` into
`DataTableColumn` entries. The `TEAM` cell keeps its accent dot, `ClubLink` and
`NoteMarker` exactly as written — it just moves inside `cell: (row) => (...)`.
`highlightRow={(row) => row.position === 1}` preserves the current highlight.

- [ ] **Step 4: Club results — same treatment**

`fetchClubProfile` in `src/db/queries/club-profile.ts` gains the same
`state`/`totalRows` handling for its results rows, tiebroken on
`(year desc, gradeKey asc)`. `club-results-table.tsx` converts to `DataTable`.
This table genuinely exceeds 50 rows for long-standing clubs, so pagination
will render here — verify it by hand on a club with 20+ seasons.

- [ ] **Step 5: Verify**

Run: `vp check && vp test`
Then `vp dev` and confirm on `/ladders`: sorting by `PTS` reorders, the URL
carries `sort=points&dir=desc`, changing grade resets to page 1. On a long-lived
club profile, page through the results table and confirm no row repeats.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: sortable paginated ladders and club results tables"
```

---

## Self-Review Notes

Spec §5 (present/past filter) is covered by Tasks 1–3; the head-to-head picker
half of §5 lands in the head-to-head plan, since those pickers do not exist yet.
Spec §6 (sorting and pagination) is covered by Tasks 4–8. The results and
head-to-head tables named in §6 are built directly on `DataTable` in the
head-to-head plan rather than converted here.
