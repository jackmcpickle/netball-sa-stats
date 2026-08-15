import { describe, expect, it } from 'vitest';
import type { ResultRow } from '@/db/queries/results';
import { ClubHistory } from '@/server/domain/club-history';

function row(over: Partial<ResultRow>): ResultRow {
    return {
        clubKey: 'matrics',
        clubName: 'Matrics',
        competitionKey: 'amnd',
        competitionName: 'AMND',
        displayName: 'Matrics',
        drawn: null,
        establishedYear: null,
        goalsAgainst: null,
        goalsFor: null,
        gradeKey: 'g',
        gradeName: 'B1',
        homeVenue: null,
        isFinal: true,
        ladderPosition: 1,
        lost: null,
        notes: null,
        percentage: null,
        placementBasis: 'regular_season_ladder',
        played: null,
        points: null,
        positionUncertain: false,
        source: 'playhq',
        teamCount: 10,
        tier: 5,
        weight: 0.6,
        won: null,
        year: 2024,
        ...over,
    };
}

describe('ClubHistory.trend', () => {
    it('emits a point per ranked year, including years the club missed', () => {
        const history = ClubHistory.from([row({ year: 2024 })], [2023, 2024]);
        const trend = history.trend();
        expect(trend.overall.map((p) => p.year)).toStrictEqual([2023, 2024]);
        expect(trend.overall[0]).toStrictEqual({
            strength: null,
            teams: 0,
            year: 2023,
        });
        expect(trend.overall[1]?.strength).toBe(1);
        expect(trend.overall[1]?.teams).toBe(1);
    });

    it('groups bands by tier and labels them without division', () => {
        const trend = ClubHistory.from(
            [
                row({ gradeName: 'Primary 1', tier: 10 }),
                row({ gradeName: 'Primary 2', ladderPosition: 10, tier: 10 }),
                row({ gradeName: 'Premier Division', tier: 1 }),
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
        expect(trend.bands.map((b) => b.tier)).toStrictEqual([1, 10]);
    });

    it('includes position_uncertain archive rows', () => {
        const trend = ClubHistory.from(
            [row({ positionUncertain: true, source: 'archive_pdf' })],
            [2024],
        ).trend();
        expect(trend.overall[0]?.strength).toBe(1);
    });

    it('omits bands the club never fielded', () => {
        const trend = ClubHistory.from([row({ tier: 5 })], [2024]).trend();
        expect(trend.bands).toHaveLength(1);
    });
});
