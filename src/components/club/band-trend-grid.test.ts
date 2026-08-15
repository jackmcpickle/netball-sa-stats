import { describe, expect, it } from 'vitest';
import { round } from '@/components/charts/scale';
import {
    bandSummaries,
    windowSizeLabel,
} from '@/components/club/band-summaries';

describe(bandSummaries, () => {
    it('drops a band with no measured season', () => {
        expect(
            bandSummaries([
                {
                    label: 'B',
                    points: [
                        { strength: null, teams: 0, year: 2000 },
                        { strength: null, teams: 0, year: 2001 },
                    ],
                    tier: 5,
                },
            ]),
        ).toHaveLength(0);
    });

    it('keeps a band with one measured season and reports no change', () => {
        const [band] = bandSummaries([
            {
                label: 'Premier Division',
                points: [
                    { strength: null, teams: 0, year: 2000 },
                    { strength: 0.75, teams: 1, year: 2001 },
                ],
                tier: 1,
            },
        ]);
        expect(band?.measured).toHaveLength(1);
        expect(band?.change).toBeNull();
        expect(band?.latest.year).toBe(2001);
    });

    it('measures change from the first to the latest measured season when only two seasons are measured', () => {
        const [band] = bandSummaries([
            {
                label: 'Primary',
                points: [
                    { strength: 0.4, teams: 2, year: 2000 },
                    { strength: null, teams: 0, year: 2001 },
                    { strength: 0.65, teams: 3, year: 2002 },
                ],
                tier: 10,
            },
        ]);
        expect(band?.change).toBe(0.25);
        expect(band?.first.year).toBe(2000);
    });

    it('averages the first three and last three measured seasons rather than comparing endpoints', () => {
        // Endpoint comparison would read latest (0.1) - first (0) = 0.1.
        // Averaging the first three (0, 0.5, 0.5 -> mean 1/3) against the
        // last three (0.5, 0.5, 0.1 -> mean 1.1/3) gives ~0.033, a
        // clearly different, smaller rise.
        const [band] = bandSummaries([
            {
                label: 'A Grade',
                points: [
                    { strength: 0, teams: 1, year: 2000 },
                    { strength: 0.5, teams: 1, year: 2001 },
                    { strength: 0.5, teams: 1, year: 2002 },
                    { strength: 0.5, teams: 1, year: 2003 },
                    { strength: 0.5, teams: 1, year: 2004 },
                    { strength: 0.5, teams: 1, year: 2005 },
                    { strength: 0.1, teams: 1, year: 2006 },
                ],
                tier: 1,
            },
        ]);
        expect(band?.measured).toHaveLength(7);
        expect(band?.change).toBe(
            round((0.5 + 0.5 + 0.1) / 3 - (0 + 0.5 + 0.5) / 3, 3),
        );
        expect(band?.change).not.toBe(round(0.1 - 0, 3));
    });

    it('uses fewer than three seasons per window when fewer than six seasons are measured', () => {
        const [band] = bandSummaries([
            {
                label: 'B Grade',
                points: [
                    { strength: 0, teams: 1, year: 2000 },
                    { strength: 0.2, teams: 1, year: 2001 },
                    { strength: 0.4, teams: 1, year: 2002 },
                    { strength: 0.9, teams: 1, year: 2003 },
                ],
                tier: 2,
            },
        ]);
        // 4 measured seasons -> window of 3, overlapping at 2002.
        // start mean (0, 0.2, 0.4) = 0.2; end mean (0.2, 0.4, 0.9) = 0.5
        expect(band?.measured).toHaveLength(4);
        expect(band?.change).toBe(round(0.5 - 0.2, 3));
    });

    it('reports the window size used, for the central-district two-season case', () => {
        const [band] = bandSummaries([
            {
                label: 'Premier Division',
                points: [
                    { strength: 0.2, teams: 3, year: 2000 },
                    { strength: 1, teams: 3, year: 2001 },
                ],
                tier: 1,
            },
        ]);
        expect(band?.measured).toHaveLength(2);
        expect(band?.windowSize).toBe(1);
        expect(band?.change).toBe(round(1 - 0.2, 3));
    });

    it('preserves the upstream tier order', () => {
        const summaries = bandSummaries([
            {
                label: 'Premier Division',
                points: [{ strength: 0.9, teams: 1, year: 2000 }],
                tier: 1,
            },
            {
                label: 'B',
                points: [{ strength: 0.2, teams: 1, year: 2000 }],
                tier: 5,
            },
        ]);
        expect(summaries.map((band) => band.tier)).toStrictEqual([1, 5]);
    });
});

describe(windowSizeLabel, () => {
    it('reads singular for a one-season window', () => {
        expect(windowSizeLabel(1)).toBe('its first season');
    });

    it('reads plural for a two-season window', () => {
        expect(windowSizeLabel(2)).toBe('its first two measured seasons');
    });

    it('reads plural for a three-season window', () => {
        expect(windowSizeLabel(3)).toBe('its first three measured seasons');
    });
});
