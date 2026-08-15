import { describe, expect, it } from 'vitest';
import { parseGradeName } from '@/pipeline/fetch/grade-name';

describe(parseGradeName, () => {
    it('parses the single-grade bands', () => {
        expect(parseGradeName('Premier Division')).toStrictEqual({
            tier: 1,
            division: null,
        });
        expect(parseGradeName('Reserves Division')).toStrictEqual({
            tier: 2,
            division: null,
        });
        expect(parseGradeName('AMND')).toStrictEqual({
            tier: 3,
            division: null,
        });
        expect(parseGradeName('A GRADE')).toStrictEqual({
            tier: 4,
            division: null,
        });
    });

    it('parses real AMND Winter 2023 names (data/raw/probe fixture)', () => {
        expect(parseGradeName('B1')).toStrictEqual({ tier: 5, division: 1 });
        expect(parseGradeName('INTER 1')).toStrictEqual({
            tier: 6,
            division: 1,
        });
        expect(parseGradeName('C6')).toStrictEqual({ tier: 7, division: 6 });
        expect(parseGradeName('Junior 5')).toStrictEqual({
            tier: 8,
            division: 5,
        });
        expect(parseGradeName('Sub Junior 2')).toStrictEqual({
            tier: 9,
            division: 2,
        });
        expect(parseGradeName('Primary 4')).toStrictEqual({
            tier: 10,
            division: 4,
        });
        expect(parseGradeName('Sub Primary 1')).toStrictEqual({
            tier: 11,
            division: 1,
        });
    });

    it('handles brief-style spacing/punctuation variants', () => {
        expect(parseGradeName('B.3')).toStrictEqual({ tier: 5, division: 3 });
        expect(parseGradeName('B. 3')).toStrictEqual({ tier: 5, division: 3 });
        expect(parseGradeName('Inter. 2')).toStrictEqual({
            tier: 6,
            division: 2,
        });
        expect(parseGradeName('C.1')).toStrictEqual({ tier: 7, division: 1 });
    });

    it('treats a trailing pool letter as the same division (real PlayHQ variant)', () => {
        expect(parseGradeName('Junior 4A')).toStrictEqual({
            tier: 8,
            division: 4,
        });
        expect(parseGradeName('Junior 4B')).toStrictEqual({
            tier: 8,
            division: 4,
        });
        expect(parseGradeName('Primary 4 A')).toStrictEqual({
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
