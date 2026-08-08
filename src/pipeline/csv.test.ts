import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '@/pipeline/csv';
import type { CsvValue } from '@/pipeline/csv';

describe('toCsv', () => {
    const rows: Record<string, CsvValue>[] = [
        { a: 1, b: 'two, three', c: null },
        { a: 2, b: 'has "quotes"', c: 'plain' },
        { a: 3, b: 'multi\nline', c: '' },
    ];

    it('is byte-identical across repeated calls on the same input', () => {
        expect(toCsv(rows)).toBe(toCsv(rows));
        expect(toCsv(rows)).toBe(toCsv(structuredClone(rows)));
    });

    it('quotes fields containing commas, quotes or newlines', () => {
        const csv = toCsv(rows);
        expect(csv).toContain('"two, three"');
        expect(csv).toContain('"has ""quotes"""');
        expect(csv).toContain('"multi\nline"');
    });

    it('round-trips through parseCsv', () => {
        const csv = toCsv(rows);
        const parsed = parseCsv(csv);
        expect(parsed).toEqual([
            { a: '1', b: 'two, three', c: '' },
            { a: '2', b: 'has "quotes"', c: 'plain' },
            { a: '3', b: 'multi\nline', c: '' },
        ]);
    });

    it('returns empty string for no rows', () => {
        expect(toCsv([])).toBe('');
    });
});
