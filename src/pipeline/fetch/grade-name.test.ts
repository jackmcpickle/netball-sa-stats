import { describe, expect, it } from 'vitest';
import { parseGradeName } from '@/pipeline/fetch/grade-name';

describe('parseGradeName', () => {
    it('parses the single-grade bands', () => {
        expect(parseGradeName('Premier Division')).toEqual({
            tier: 1,
            division: null,
        });
        expect(parseGradeName('Reserves Division')).toEqual({
            tier: 2,
            division: null,
        });
        expect(parseGradeName('AMND')).toEqual({ tier: 3, division: null });
        expect(parseGradeName('A GRADE')).toEqual({ tier: 4, division: null });
    });

    it('parses real AMND Winter 2023 names (data/raw/probe fixture)', () => {
        expect(parseGradeName('B1')).toEqual({ tier: 5, division: 1 });
        expect(parseGradeName('INTER 1')).toEqual({ tier: 6, division: 1 });
        expect(parseGradeName('C6')).toEqual({ tier: 7, division: 6 });
        expect(parseGradeName('Junior 5')).toEqual({ tier: 8, division: 5 });
        expect(parseGradeName('Sub Junior 2')).toEqual({
            tier: 9,
            division: 2,
        });
        expect(parseGradeName('Primary 4')).toEqual({ tier: 10, division: 4 });
        expect(parseGradeName('Sub Primary 1')).toEqual({
            tier: 11,
            division: 1,
        });
    });

    it('handles brief-style spacing/punctuation variants', () => {
        expect(parseGradeName('B.3')).toEqual({ tier: 5, division: 3 });
        expect(parseGradeName('B. 3')).toEqual({ tier: 5, division: 3 });
        expect(parseGradeName('Inter. 2')).toEqual({ tier: 6, division: 2 });
        expect(parseGradeName('C.1')).toEqual({ tier: 7, division: 1 });
    });

    it('treats a trailing pool letter as the same division (real PlayHQ variant)', () => {
        expect(parseGradeName('Junior 4A')).toEqual({ tier: 8, division: 4 });
        expect(parseGradeName('Junior 4B')).toEqual({ tier: 8, division: 4 });
        expect(parseGradeName('Primary 4 A')).toEqual({
            tier: 10,
            division: 4,
        });
    });

    it('throws on an unrecognised name, including the offending name', () => {
        expect(() => parseGradeName('Mystery Grade 9')).toThrow(
            /Mystery Grade 9/u,
        );
    });
});
