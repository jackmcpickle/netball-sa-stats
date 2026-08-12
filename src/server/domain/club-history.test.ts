import { describe, expect, it } from 'vitest';
import type { ResultRow } from '@/db/queries/results';
import {
    ClubHistory,
    sortClubResults,
    toGradeResults,
} from '@/server/domain/club-history';
import { TableQuery } from '@/server/domain/table-query';

const spec = {
    sortable: ['year', 'grade', 'position', 'won'],
    defaultSort: 'year',
    defaultDesc: true,
} as const;

function row(over: Partial<ResultRow>): ResultRow {
    return {
        clubKey: 'matrics',
        clubName: 'Matrics',
        establishedYear: null,
        homeVenue: null,
        year: 2024,
        isFinal: true,
        source: 'playhq',
        placementBasis: 'regular_season_ladder',
        gradeKey: 'g',
        gradeName: 'B1',
        competitionKey: 'amnd',
        competitionName: 'AMND',
        tier: 5,
        teamCount: 10,
        displayName: 'Matrics',
        ladderPosition: 1,
        positionUncertain: false,
        weight: 0.6,
        played: null,
        won: null,
        drawn: null,
        lost: null,
        goalsFor: null,
        goalsAgainst: null,
        percentage: null,
        points: null,
        notes: null,
        ...over,
    };
}

describe('sortClubResults', () => {
    it('breaks ties on (year desc, gradeKey asc) so paging is stable', () => {
        const rows = [
            row({ year: 2020, gradeKey: 'c' }),
            row({ year: 2020, gradeKey: 'a' }),
            row({ year: 2021, gradeKey: 'a' }),
            row({ year: 2020, gradeKey: 'b' }),
        ];
        const sorted = sortClubResults(
            toGradeResults(rows),
            TableQuery.from({ sort: 'position', dir: 'asc' }, spec),
        );
        expect(
            sorted.map((entry) => `${String(entry.year)}-${entry.gradeKey}`),
        ).toEqual(['2021-a', '2020-a', '2020-b', '2020-c']);
    });

    it('defaults to year descending', () => {
        const rows = [row({ year: 2018 }), row({ year: 2022 })];
        const sorted = sortClubResults(
            toGradeResults(rows),
            TableQuery.from({ sort: 'year', dir: 'desc' }, spec),
        );
        expect(sorted.map((entry) => entry.year)).toEqual([2022, 2018]);
    });

    it('sorts by grade name ascending', () => {
        const rows = [
            row({ gradeKey: 'zed', gradeName: 'zed' }),
            row({ gradeKey: 'ace', gradeName: 'ace' }),
        ];
        const sorted = sortClubResults(
            toGradeResults(rows),
            TableQuery.from({ sort: 'grade', dir: 'asc' }, spec),
        );
        expect(sorted[0]?.gradeKey).toBe('ace');
    });
});

/**
 * `sort=played`/`sort=points` are attacker-reachable via URL search
 * params — both go through the private `played()`/`points()` helpers, so
 * exercise them via the exported `sortClubResults` with rows that differ
 * only on the field being sorted.
 */
describe('sortClubResults attacker-reachable columns', () => {
    const playedSpec = {
        sortable: ['played', 'points'],
        defaultSort: 'played',
        defaultDesc: false,
    } as const;

    it('sorts by played (won+lost+drawn) ascending', () => {
        const rows = [
            row({ gradeKey: 'a', won: 10, lost: 5, drawn: 1 }),
            row({ gradeKey: 'b', won: 1, lost: 1, drawn: 0 }),
        ];
        const sorted = sortClubResults(
            toGradeResults(rows),
            TableQuery.from({ sort: 'played', dir: 'asc' }, playedSpec),
        );
        expect(sorted.map((entry) => entry.gradeKey)).toEqual(['b', 'a']);
    });

    it('sorts by points (2*won + drawn) descending', () => {
        // `points` has no header of its own on the production club-results
        // table (see CLUB_RESULTS_TABLE_SPEC), but the underlying `points()`
        // helper is still allow-listed in RESULT_COMPARATORS, so exercise it
        // directly with a local spec.
        const rows = [
            row({ gradeKey: 'few-points', won: 1, drawn: 0 }),
            row({ gradeKey: 'many-points', won: 5, drawn: 2 }),
        ];
        const sorted = sortClubResults(
            toGradeResults(rows),
            TableQuery.from({ sort: 'points', dir: 'desc' }, playedSpec),
        );
        expect(sorted.map((entry) => entry.gradeKey)).toEqual([
            'many-points',
            'few-points',
        ]);
    });
});

describe('ClubHistory.trend', () => {
    it('emits a point per ranked year, including years the club missed', () => {
        const history = ClubHistory.from([row({ year: 2024 })], [2023, 2024]);
        const trend = history.trend();
        expect(trend.overall.map((p) => p.year)).toEqual([2023, 2024]);
        expect(trend.overall[0]).toEqual({
            year: 2023,
            strength: null,
            teams: 0,
        });
        expect(trend.overall[1]?.strength).toBe(1);
        expect(trend.overall[1]?.teams).toBe(1);
    });

    it('groups bands by tier and labels them without division', () => {
        const trend = ClubHistory.from(
            [
                row({ tier: 10, gradeName: 'Primary 1' }),
                row({ tier: 10, gradeName: 'Primary 2', ladderPosition: 10 }),
                row({ tier: 1, gradeName: 'Premier Division' }),
            ],
            [2024],
        ).trend();
        const primary = trend.bands.find((b) => b.tier === 10);
        expect(primary?.label).toBe('Primary');
        expect(primary?.points[0]?.teams).toBe(2);
        expect(primary?.points[0]?.strength).toBeCloseTo(0.5, 5);
    });

    it('orders bands strongest first', () => {
        const trend = ClubHistory.from(
            [row({ tier: 10 }), row({ tier: 1 })],
            [2024],
        ).trend();
        expect(trend.bands.map((b) => b.tier)).toEqual([1, 10]);
    });

    it('includes position_uncertain archive rows', () => {
        const trend = ClubHistory.from(
            [row({ source: 'archive_pdf', positionUncertain: true })],
            [2024],
        ).trend();
        expect(trend.overall[0]?.strength).toBe(1);
    });

    it('omits bands the club never fielded', () => {
        const trend = ClubHistory.from([row({ tier: 5 })], [2024]).trend();
        expect(trend.bands).toHaveLength(1);
    });
});
