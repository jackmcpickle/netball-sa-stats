import { describe, expect, it } from 'vitest';
import { strengthPath } from '@/components/charts/trend-chart';

describe('strengthPath', () => {
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
