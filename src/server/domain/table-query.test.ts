import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE } from '@/db/queries/pagination';
import { TableQuery } from '@/server/domain/table-query';

const spec = {
    sortable: ['year', 'points'],
    defaultSort: 'year',
    defaultDesc: true,
} as const;

describe('TableQuery.from', () => {
    it('defaults everything when nothing is supplied', () => {
        expect(TableQuery.from({}, spec).state).toEqual({
            sort: 'year',
            desc: true,
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
        });
    });

    it('rejects a sort column outside the allow-list', () => {
        // Column ids reach the in-memory comparators, so an unknown one must never pass through.
        expect(
            TableQuery.from({ sort: 'points; drop table' }, spec).state.sort,
        ).toBe('year');
    });

    it('accepts an allowed sort column and direction', () => {
        expect(
            TableQuery.from({ sort: 'points', dir: 'asc' }, spec).state,
        ).toEqual({
            sort: 'points',
            desc: false,
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
        });
    });

    it('clamps page size to the allow-list', () => {
        expect(TableQuery.from({ pageSize: 100 }, spec).state.pageSize).toBe(
            100,
        );
        expect(TableQuery.from({ pageSize: 5000 }, spec).state.pageSize).toBe(
            DEFAULT_PAGE_SIZE,
        );
    });

    it('floors page at 1', () => {
        expect(TableQuery.from({ page: 0 }, spec).state.page).toBe(1);
        expect(TableQuery.from({ page: -3 }, spec).state.page).toBe(1);
    });
});

interface Row {
    readonly id: number;
}

function identitySort(rows: readonly Row[], q: TableQuery): readonly Row[] {
    const direction = q.state.desc ? -1 : 1;
    return [...rows].sort((a, b) => (a.id - b.id) * direction);
}

function rowsOf(count: number): Row[] {
    return Array.from({ length: count }, (_, index) => ({ id: index }));
}

describe('TableQuery#apply', () => {
    it('clamps an out-of-range page to the last page instead of returning empty', () => {
        const result = TableQuery.from({ page: 999, pageSize: 50 }, spec).apply(
            rowsOf(101),
            identitySort,
        );
        expect(result.state.page).toBe(3);
        expect(result.rows).toHaveLength(1);
        expect(result.totalRows).toBe(101);
    });

    it('leaves an in-range page untouched', () => {
        const result = TableQuery.from({ page: 2, pageSize: 50 }, spec).apply(
            rowsOf(101),
            identitySort,
        );
        expect(result.state.page).toBe(2);
        expect(result.rows).toHaveLength(50);
    });

    it('clamps to page 1 when there are no rows at all', () => {
        const result = TableQuery.from({ page: 5, pageSize: 50 }, spec).apply(
            rowsOf(0),
            identitySort,
        );
        expect(result.state.page).toBe(1);
        expect(result.rows).toHaveLength(0);
    });
});

describe('TableQuery end-to-end: consecutive pages are disjoint and cover every row', () => {
    it('covers a realistic multi-page dataset with no repeats and none missing', () => {
        const totalRows = 237;
        const pageSize = 50;
        const all = rowsOf(totalRows);
        const pages = Math.ceil(totalRows / pageSize);

        const seen = new Set<number>();
        for (let page = 1; page <= pages; page += 1) {
            const { rows } = TableQuery.from(
                { page, pageSize, dir: 'asc' },
                spec,
            ).apply(all, identitySort);
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
