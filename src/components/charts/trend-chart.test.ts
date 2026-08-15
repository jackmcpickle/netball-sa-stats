import { describe, expect, it } from 'vitest';
import {
    describeTrendSlot,
    strengthPath,
} from '@/components/charts/trend-chart';

describe(strengthPath, () => {
    it('breaks the line where strength is null', () => {
        const segments = strengthPath([
            { year: 2000, strength: 0.5, teams: 3 },
            { year: 2001, strength: null, teams: 0 },
            { year: 2002, strength: 0.8, teams: 4 },
        ]);
        expect(segments).toHaveLength(2);
    });

    it('keeps consecutive measured years in one segment', () => {
        const segments = strengthPath([
            { year: 2000, strength: 0.5, teams: 3 },
            { year: 2001, strength: 0.6, teams: 3 },
        ]);
        expect(segments).toHaveLength(1);
        expect(segments[0]).toHaveLength(2);
    });

    it('breaks across a calendar gap even when both years are measured', () => {
        const segments = strengthPath([
            { year: 2014, strength: 0.58, teams: 31 },
            { year: 2016, strength: 0.54, teams: 33 },
        ]);
        expect(segments).toHaveLength(2);
    });

    it('returns nothing when no year is measurable', () => {
        expect(
            strengthPath([{ year: 2000, strength: null, teams: 0 }]),
        ).toHaveLength(0);
    });
});

describe(describeTrendSlot, () => {
    it('attributes a null strength to no teams fielded when teams is zero', () => {
        expect(
            describeTrendSlot({ year: 2000, strength: null, teams: 0 }, 2000),
        ).toBe('2000: no teams fielded, strength —');
    });

    it('attributes a null strength to no measurable finish when teams were fielded', () => {
        expect(
            describeTrendSlot({ year: 2000, strength: null, teams: 1 }, 2000),
        ).toBe('2000: no measurable finish, strength —');
    });

    it('reports the missing-season placeholder when there is no point for the slot', () => {
        expect(describeTrendSlot(undefined, 2000)).toBe('2000: —');
    });

    it('reports strength normally when measured', () => {
        expect(
            describeTrendSlot({ year: 2000, strength: 0.5, teams: 3 }, 2000),
        ).toBe('2000: strength 0.500 from 3 teams.');
    });
});
