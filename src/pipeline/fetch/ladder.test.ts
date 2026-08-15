import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractSquadNumber } from '@/pipeline/fetch/keys';
import {
    flattenStandings,
    mapStandingsToResults,
} from '@/pipeline/fetch/ladder';
import type { GradeLadderResponse } from '@/pipeline/fetch/types';

const fixturePath = resolve(
    import.meta.dirname,
    '../../../data/raw/probe/gradeLadder_premier_2023_3c7d2b13.json',
);

function loadFixture(): GradeLadderResponse {
    // SAFETY: this repo's own committed PlayHQ probe capture, the recorded
    // `gradeLadder` response; the asserted shape is the same one `collect.ts`
    // reads that capture back as.
    return JSON.parse(
        readFileSync(fixturePath, 'utf-8'),
    ) as GradeLadderResponse;
}

describe(mapStandingsToResults, () => {
    const response = loadFixture();
    const { discoverGrade } = response.data;
    if (discoverGrade === null) {
        throw new Error('fixture has no discoverGrade');
    }
    const standings = flattenStandings(discoverGrade.ladder);

    it('reads 8 teams from the 2023 Premier Division fixture', () => {
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
        if (contax === undefined) {
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
