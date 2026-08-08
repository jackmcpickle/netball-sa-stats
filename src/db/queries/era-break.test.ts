import { describe, expect, it } from 'vitest';
import {
    methodologyBreak,
    movementBoundaryChanged,
    timelineGaps,
} from '@/db/queries/era-break';

describe('movementBoundaryChanged', () => {
    const base = {
        year: 2023,
        previousYear: 2022,
        competitionKeys: new Set(['amnd']),
        previousCompetitionKeys: new Set(['amnd']),
        sources: new Set(['playhq']),
        previousSources: new Set(['playhq']),
        placementBases: new Set(['regular_season_ladder']),
        previousPlacementBases: new Set(['regular_season_ladder']),
    };

    it('is false for adjacent comparable seasons', () => {
        expect(movementBoundaryChanged(base)).toBe(false);
    });

    it('is true across a calendar gap', () => {
        expect(
            movementBoundaryChanged({
                ...base,
                year: 2022,
                previousYear: 2016,
            }),
        ).toBe(true);
    });

    it('is true when source changes archive → playhq', () => {
        expect(
            movementBoundaryChanged({
                ...base,
                year: 2022,
                previousYear: 2016,
                sources: new Set(['playhq']),
                previousSources: new Set(['archive_pdf']),
                placementBases: new Set(['regular_season_ladder']),
                previousPlacementBases: new Set(['final_premiership_placings']),
            }),
        ).toBe(true);
    });

    it('is true when competitions widen', () => {
        expect(
            movementBoundaryChanged({
                ...base,
                competitionKeys: new Set([
                    'amnd',
                    'premier_league',
                    'premier_league_reserves',
                ]),
                previousCompetitionKeys: new Set(['amnd']),
            }),
        ).toBe(true);
    });
});

describe('timelineGaps', () => {
    it('reports missing years between ranked seasons', () => {
        expect(timelineGaps([2014, 2016, 2022, 2023])).toEqual([
            { afterYear: 2014, missingYears: [2015] },
            { afterYear: 2016, missingYears: [2017, 2018, 2019, 2020, 2021] },
        ]);
    });
});

describe('methodologyBreak', () => {
    it('finds the first source change along ranked years', () => {
        const sourceByYear = new Map<number, ReadonlySet<string>>([
            [2014, new Set(['archive_pdf'])],
            [2016, new Set(['archive_pdf'])],
            [2022, new Set(['playhq'])],
            [2023, new Set(['playhq'])],
        ]);
        expect(
            methodologyBreak({
                rankedYears: [2014, 2016, 2022, 2023],
                sourceByYear,
            }),
        ).toEqual({ afterYear: 2016, beforeYear: 2022 });
    });
});
