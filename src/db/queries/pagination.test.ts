import { describe, expect, it } from 'vitest';
import { offsetFor, pageCount } from '@/db/queries/pagination';

describe(offsetFor, () => {
    it('is zero on the first page', () => {
        expect(
            offsetFor({ desc: true, page: 1, pageSize: 50, sort: 'year' }),
        ).toBe(0);
    });

    it('steps by page size', () => {
        expect(
            offsetFor({ desc: true, page: 3, pageSize: 50, sort: 'year' }),
        ).toBe(100);
    });
});

describe(pageCount, () => {
    it('rounds up a partial final page', () => {
        expect(pageCount(101, 50)).toBe(3);
    });

    it('is one page when empty, so the UI never shows "page 1 of 0"', () => {
        expect(pageCount(0, 50)).toBe(1);
    });
});
