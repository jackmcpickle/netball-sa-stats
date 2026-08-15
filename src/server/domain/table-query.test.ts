import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE } from '@/db/queries/pagination';
import type { PageRequest } from '@/server/domain/table-query';
import { TableQuery } from '@/server/domain/table-query';

const spec = {
    defaultDesc: true,
    defaultSort: 'year',
    sortable: ['year', 'points'],
} as const;

describe('TableQuery.from', () => {
    it('defaults everything when nothing is supplied', () => {
        expect(TableQuery.from({}, spec).state).toStrictEqual({
            desc: true,
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
            sort: 'year',
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
            TableQuery.from({ dir: 'asc', sort: 'points' }, spec).state,
        ).toStrictEqual({
            desc: false,
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
            sort: 'points',
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
    return rows.toSorted((a, b) => (a.id - b.id) * direction);
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
                { dir: 'asc', page, pageSize },
                spec,
            ).apply(all, identitySort);
            for (const row of rows) {
                expect(seen.has(row.id)).toBeFalsy();
                seen.add(row.id);
            }
        }
        expect(seen.size).toBe(totalRows);
        expect([...seen].toSorted((a, b) => a - b)).toStrictEqual(
            all.map((row) => row.id),
        );
    });
});

describe('TableQuery#page', () => {
    function pagedRowsOf(count: number) {
        return async (request: PageRequest): Promise<readonly Row[]> => {
            const all = rowsOf(count);
            const sorted = request.desc ? all.toReversed() : all;
            return sorted.slice(request.offset, request.offset + request.limit);
        };
    }

    it('counts before it fetches, so the page can be clamped', async () => {
        // The whole point of the helper: a repo cannot clamp its own page,
        // because the clamp needs a row count it does not have.
        const calls: string[] = [];
        await TableQuery.from({ page: 999, pageSize: 50 }, spec).page(
            async () => {
                calls.push('count');
                return 101;
            },
            async (request) => {
                calls.push(`fetch@${String(request.offset)}`);
                return [];
            },
        );
        expect(calls).toStrictEqual(['count', 'fetch@100']);
    });

    it('clamps an out-of-range page to the last page instead of returning empty', async () => {
        const result = await TableQuery.from(
            { page: 999, pageSize: 50 },
            spec,
        ).page(async () => 101, pagedRowsOf(101));
        expect(result.state.page).toBe(3);
        expect(result.rows).toHaveLength(1);
        expect(result.totalRows).toBe(101);
    });

    it('leaves an in-range page untouched', async () => {
        const result = await TableQuery.from(
            { page: 2, pageSize: 50 },
            spec,
        ).page(async () => 101, pagedRowsOf(101));
        expect(result.state.page).toBe(2);
        expect(result.rows).toHaveLength(50);
    });

    it('clamps to page 1 when there are no rows at all', async () => {
        const result = await TableQuery.from(
            { page: 5, pageSize: 50 },
            spec,
        ).page(async () => 0, pagedRowsOf(0));
        expect(result.state.page).toBe(1);
        expect(result.rows).toHaveLength(0);
        expect(result.totalRows).toBe(0);
    });

    it('hands the repo an allow-listed sort column, never the raw URL value', async () => {
        const seen: PageRequest[] = [];
        await TableQuery.from({ sort: 'points; drop table' }, spec).page(
            async () => 10,
            async (request) => {
                seen.push(request);
                return [];
            },
        );
        expect(seen[0].sort).toBe('year');
    });

    it('hands the repo the clamped offset, not the requested one', async () => {
        const seen: PageRequest[] = [];
        await TableQuery.from({ page: 999, pageSize: 25 }, spec).page(
            async () => 30,
            async (request) => {
                seen.push(request);
                return [];
            },
        );
        // Page 2 of 2, not page 999.
        expect(seen[0].offset).toBe(25);
        expect(seen[0].limit).toBe(25);
    });

    it('covers a realistic multi-page dataset with no repeats and none missing', async () => {
        const totalRows = 237;
        const pageSize = 50;
        const fetchPage = pagedRowsOf(totalRows);
        const seen = new Set<number>();

        for (let page = 1; page <= Math.ceil(totalRows / pageSize); page += 1) {
            // eslint-disable-next-line no-await-in-loop -- pages are fetched in order on purpose
            const { rows } = await TableQuery.from(
                { dir: 'asc', page, pageSize },
                spec,
            ).page(async () => totalRows, fetchPage);
            for (const row of rows) {
                expect(seen.has(row.id)).toBeFalsy();
                seen.add(row.id);
            }
        }
        expect(seen.size).toBe(totalRows);
    });
});
