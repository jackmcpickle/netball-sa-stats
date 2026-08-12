import { describe, expect, it } from 'vitest';
import type { ResultRow } from '@/db/queries/results';
import { ClubHistory } from '@/server/domain/club-history';

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
