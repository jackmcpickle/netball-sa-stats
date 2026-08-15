import { describe, expect, it } from 'vitest';
import { parseGradeName } from '@/pipeline/fetch/grade-name';

describe(parseGradeName, () => {
    it('parses the single-grade bands', () => {
        expect(parseGradeName('Premier Division')).toStrictEqual({
            division: null,
            tier: 1,
        });
        expect(parseGradeName('Reserves Division')).toStrictEqual({
            division: null,
            tier: 2,
        });
        expect(parseGradeName('AMND')).toStrictEqual({
            division: null,
            tier: 3,
        });
        expect(parseGradeName('A GRADE')).toStrictEqual({
            division: null,
            tier: 4,
        });
    });

    it('parses real AMND Winter 2023 names (data/raw/probe fixture)', () => {
        expect(parseGradeName('B1')).toStrictEqual({ division: 1, tier: 5 });
        expect(parseGradeName('INTER 1')).toStrictEqual({
            division: 1,
            tier: 6,
        });
        expect(parseGradeName('C6')).toStrictEqual({ division: 6, tier: 7 });
        expect(parseGradeName('Junior 5')).toStrictEqual({
            division: 5,
            tier: 8,
        });
        expect(parseGradeName('Sub Junior 2')).toStrictEqual({
            division: 2,
            tier: 9,
        });
        expect(parseGradeName('Primary 4')).toStrictEqual({
            division: 4,
            tier: 10,
        });
        expect(parseGradeName('Sub Primary 1')).toStrictEqual({
            division: 1,
            tier: 11,
        });
    });

    it('handles brief-style spacing/punctuation variants', () => {
        expect(parseGradeName('B.3')).toStrictEqual({ division: 3, tier: 5 });
        expect(parseGradeName('B. 3')).toStrictEqual({ division: 3, tier: 5 });
        expect(parseGradeName('Inter. 2')).toStrictEqual({
            division: 2,
            tier: 6,
        });
        expect(parseGradeName('C.1')).toStrictEqual({ division: 1, tier: 7 });
    });

    it('treats a trailing pool letter as the same division (real PlayHQ variant)', () => {
        expect(parseGradeName('Junior 4A')).toStrictEqual({
            division: 4,
            tier: 8,
        });
        expect(parseGradeName('Junior 4B')).toStrictEqual({
            division: 4,
            tier: 8,
        });
        expect(parseGradeName('Primary 4 A')).toStrictEqual({
            division: 4,
            tier: 10,
        });
    });

    it('throws on an unrecognised name, including the offending name', () => {
        expect(() => parseGradeName('Mystery Grade 9')).toThrow(
            /Mystery Grade 9/u,
        );
    });
});
