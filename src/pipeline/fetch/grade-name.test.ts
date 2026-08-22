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

    it('throws on an unrecognised AMND name, including the offending name', () => {
        expect(() => parseGradeName('Mystery Grade 9')).toThrow(
            /Mystery Grade 9/u,
        );
    });

    it('falls back on an unknown association grade instead of throwing', () => {
        expect(parseGradeName('Mystery Grade 9', 'saucna')).toStrictEqual({
            division: 9,
            tier: 99,
        });
        expect(parseGradeName('Open Women', 'elizabeth')).toStrictEqual({
            division: null,
            tier: 99,
        });
    });

    it('does not parse association names as AMND bands', () => {
        expect(() => parseGradeName('A1')).toThrow(/A1/u);
        expect(() => parseGradeName('Seniors Div 01')).toThrow(
            /Seniors Div 01/u,
        );
        expect(() => parseGradeName('8U/1')).toThrow(/8U\/1/u);
    });
});

describe('parseGradeName for SA associations', () => {
    it('parses senior A/B/C names from the 2025 winter grade lists', () => {
        expect(parseGradeName('A1', 'saucna')).toStrictEqual({
            division: 1,
            tier: 1,
        });
        expect(parseGradeName('A grade', 'elizabeth')).toStrictEqual({
            division: null,
            tier: 1,
        });
        expect(parseGradeName('A2 Grade', 'city_night_division')).toStrictEqual(
            {
                division: 2,
                tier: 1,
            },
        );
        expect(parseGradeName('B5', 'saucna')).toStrictEqual({
            division: 5,
            tier: 2,
        });
        expect(parseGradeName('C grade', 'elizabeth')).toStrictEqual({
            division: null,
            tier: 3,
        });
        expect(parseGradeName('C2', 'elizabeth')).toStrictEqual({
            division: 2,
            tier: 3,
        });
        expect(parseGradeName('D3', 'elizabeth')).toStrictEqual({
            division: 3,
            tier: 3,
        });
        expect(parseGradeName('Seniors Div 01', 'suna')).toStrictEqual({
            division: 1,
            tier: 1,
        });
        expect(parseGradeName('Seniors Div 06', 'suna')).toStrictEqual({
            division: 6,
            tier: 1,
        });
    });

    it('parses inter and age-group names from the verified winter lists', () => {
        expect(parseGradeName('Inter 1', 'elizabeth')).toStrictEqual({
            division: 1,
            tier: 4,
        });
        expect(
            parseGradeName('INTER 4 A', 'city_night_division'),
        ).toStrictEqual({
            division: 4,
            tier: 4,
        });
        expect(parseGradeName('Inters 2', 'suna')).toStrictEqual({
            division: 2,
            tier: 4,
        });
        expect(parseGradeName('Junior 3', 'elizabeth')).toStrictEqual({
            division: 3,
            tier: 8,
        });
        expect(parseGradeName('NSG - GO1', 'elizabeth')).toStrictEqual({
            division: 1,
            tier: 12,
        });
        expect(
            parseGradeName('M-League - Mens Division', 'sammna'),
        ).toStrictEqual({
            division: null,
            tier: 1,
        });
        expect(parseGradeName('8U/1', 'saucna')).toStrictEqual({
            division: 1,
            tier: 10,
        });
        expect(parseGradeName('17U/7', 'saucna')).toStrictEqual({
            division: 7,
            tier: 5,
        });
        expect(parseGradeName('11u Div1', 'suna')).toStrictEqual({
            division: 1,
            tier: 8,
        });
        expect(parseGradeName('9&U Div 1', 'suna')).toStrictEqual({
            division: 1,
            tier: 9,
        });
        expect(parseGradeName('13 & Under Division 3', 'suna')).toStrictEqual({
            division: 3,
            tier: 7,
        });
    });
});
