import { describe, expect, it } from 'vitest';
import {
    applyTableState,
    DEFAULT_PAGE_SIZE,
    offsetFor,
    pageCount,
    resolveTableState,
    type TableState,
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
        // Column ids reach the in-memory comparators, so an unknown one must never pass through.
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

interface Row {
    readonly id: number;
}

function identitySort(rows: readonly Row[], state: TableState): readonly Row[] {
    const direction = state.desc ? -1 : 1;
    return [...rows].sort((a, b) => (a.id - b.id) * direction);
}

function rowsOf(count: number): Row[] {
    return Array.from({ length: count }, (_, index) => ({ id: index }));
}

describe('applyTableState', () => {
    it('clamps an out-of-range page to the last page instead of returning empty', () => {
        const result = applyTableState(
            rowsOf(101),
            { page: 999, pageSize: 50 },
            spec,
            identitySort,
        );
        expect(result.tableState.page).toBe(3);
        expect(result.rows).toHaveLength(1);
        expect(result.totalRows).toBe(101);
    });

    it('leaves an in-range page untouched', () => {
        const result = applyTableState(
            rowsOf(101),
            { page: 2, pageSize: 50 },
            spec,
            identitySort,
        );
        expect(result.tableState.page).toBe(2);
        expect(result.rows).toHaveLength(50);
    });

    it('clamps to page 1 when there are no rows at all', () => {
        const result = applyTableState(
            rowsOf(0),
            { page: 5, pageSize: 50 },
            spec,
            identitySort,
        );
        expect(result.tableState.page).toBe(1);
        expect(result.rows).toHaveLength(0);
    });
});

describe('pagination end-to-end: consecutive pages are disjoint and cover every row', () => {
    it('covers a realistic multi-page dataset with no repeats and none missing', () => {
        const totalRows = 237;
        const pageSize = 50;
        const all = rowsOf(totalRows);
        const pages = pageCount(totalRows, pageSize);

        const seen = new Set<number>();
        for (let page = 1; page <= pages; page += 1) {
            const { rows } = applyTableState(
                all,
                { page, pageSize, dir: 'asc' },
                spec,
                identitySort,
            );
            for (const row of rows) {
                expect(seen.has(row.id)).toBe(false);
                seen.add(row.id);
            }
        }
        expect(seen.size).toBe(totalRows);
        expect([...seen].sort((a, b) => a - b)).toEqual(
            all.map((row) => row.id),
        );
    });
});
