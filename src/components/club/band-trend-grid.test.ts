import { describe, expect, it } from 'vitest';
import { bandSummaries } from '@/components/club/band-trend-grid';

describe('bandSummaries', () => {
    it('drops a band with no measured season', () => {
        expect(
            bandSummaries([
                {
                    tier: 5,
                    label: 'B',
                    points: [
                        { year: 2000, strength: null, teams: 0 },
                        { year: 2001, strength: null, teams: 0 },
                    ],
                },
            ]),
        ).toHaveLength(0);
    });

    it('keeps a band with one measured season and reports no change', () => {
        const [band] = bandSummaries([
            {
                tier: 1,
                label: 'Premier Division',
                points: [
                    { year: 2000, strength: null, teams: 0 },
                    { year: 2001, strength: 0.75, teams: 1 },
                ],
            },
        ]);
        expect(band?.measured).toHaveLength(1);
        expect(band?.change).toBeNull();
        expect(band?.latest.year).toBe(2001);
    });

    it('measures change from the first to the latest measured season', () => {
        const [band] = bandSummaries([
            {
                tier: 10,
                label: 'Primary',
                points: [
                    { year: 2000, strength: 0.4, teams: 2 },
                    { year: 2001, strength: null, teams: 0 },
                    { year: 2002, strength: 0.65, teams: 3 },
                ],
            },
        ]);
        expect(band?.change).toBe(0.25);
        expect(band?.first.year).toBe(2000);
    });

    it('preserves the upstream tier order', () => {
        const summaries = bandSummaries([
            {
                tier: 1,
                label: 'Premier Division',
                points: [{ year: 2000, strength: 0.9, teams: 1 }],
            },
            {
                tier: 5,
                label: 'B',
                points: [{ year: 2000, strength: 0.2, teams: 1 }],
            },
        ]);
        expect(summaries.map((band) => band.tier)).toEqual([1, 5]);
    });
});
