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
