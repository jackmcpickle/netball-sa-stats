import { isUndefined } from 'es-toolkit';
import { describe, expect, it } from 'vitest';
import { extractSquadNumber } from '@/pipeline/fetch/keys';
import { mapStandingsToResults } from '@/pipeline/fetch/ladder';
import type { Standing } from '@/pipeline/fetch/ladder';

function standingOf(
    name: string,
    pointsFor: number,
    pointsAgainst: number,
): Standing {
    return {
        byes: 0,
        competitionPoints: 20,
        drawn: 0,
        forfeits: 0,
        lost: 4,
        percentage: 100,
        played: 14,
        pointsAgainst,
        pointsDifference: 0,
        pointsFor,
        team: {
            id: name.toLowerCase().replaceAll(' ', '-'),
            name,
            organisation: {
                id: name.toLowerCase().replaceAll(' ', '-'),
                name,
                type: 'CLUB',
            },
        },
        won: 10,
    };
}

describe(mapStandingsToResults, () => {
    const standings = [
        standingOf('Contax', 879, 538),
        standingOf('Matrics', 800, 600),
        standingOf('South Adelaide', 700, 650),
        standingOf('Woods', 680, 660),
        standingOf('Garville', 650, 670),
        standingOf('Oakdale', 620, 690),
        standingOf('Contax 2', 600, 710),
        standingOf('Walkerville', 580, 730),
    ];

    it('reads 8 teams from the handmade ladder', () => {
        expect(standings).toHaveLength(8);
    });

    it('assigns 1-based ladder_position in array order', () => {
        const rows = mapStandingsToResults(
            'premier_league-annual-2023-premier-division',
            standings,
            (id, name) => `${name}-${id}`,
            1000,
            (standing) => extractSquadNumber(standing.team.name),
        );
        expect(rows.map((r) => r.ladder_position)).toStrictEqual([
            1, 2, 3, 4, 5, 6, 7, 8,
        ]);
        expect(rows[0]?.display_name).toBe('Contax');
    });

    it('derives goal_difference from pointsFor - pointsAgainst, never the always-zero API value', () => {
        const rows = mapStandingsToResults(
            'grade-key',
            standings,
            (id, name) => `${name}-${id}`,
            1000,
            (standing) => extractSquadNumber(standing.team.name),
        );
        const [contax] = rows;
        if (isUndefined(contax)) {
            throw new Error('missing row');
        }
        expect(contax.goals_for).toBe(879);
        expect(contax.goals_against).toBe(538);
        expect(contax.goal_difference).toBe(879 - 538);
        // Sanity: PlayHQ's own pointsDifference field is always 0 in this fixture.
        expect(standings[0]?.pointsDifference).toBe(0);
    });

    it('leaves shots_attempted/shots_scored empty and sets fixed provenance fields', () => {
        const [row] = mapStandingsToResults(
            'grade-key',
            standings,
            (id, name) => `${name}-${id}`,
            1000,
            (standing) => extractSquadNumber(standing.team.name),
        );
        expect(row?.shots_attempted).toBeNull();
        expect(row?.shots_scored).toBeNull();
        expect(row?.source).toBe('playhq');
        expect(row?.placement_basis).toBe('regular_season_ladder');
        expect(row?.position_uncertain).toBe(0);
    });
});
