import type { CsvValue } from '@/pipeline/csv';
/**
 * Pure mapping from a `gradeLadder` response's standings to
 * `team_season_results` CSV rows. No network, no filesystem — fixture-tested
 * against the committed `data/raw/probe/gradeLadder_*.json` captures.
 */

export type Standing = {
    team: {
        id: string;
        name: string;
        organisation: { id: string; name: string; type: string };
    };
    played: number;
    won: number;
    lost: number;
    drawn: number;
    byes: number;
    pointsFor: number;
    pointsAgainst: number;
    pointsDifference: number;
    forfeits: number;
    percentage: number;
    competitionPoints: number;
};

export type LadderPool = {
    pool: { id: string; name: string } | null;
    standings: readonly Standing[];
};

/** Flattens across pools in returned order — ladder_position is 1-based over this list. */
export function flattenStandings(
    ladder: readonly LadderPool[],
): readonly Standing[] {
    return ladder.flatMap((pool) => pool.standings);
}

export type TeamSeasonResultRow = Record<string, CsvValue> & {
    grade_key: string;
    club_key: string;
    squad_number: number | null;
    display_name: string;
    ladder_position: number;
    position_uncertain: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    byes: number;
    goals_for: number;
    goals_against: number;
    goal_difference: number;
    points: number;
    percentage: number;
    shots_attempted: null;
    shots_scored: null;
    source: 'playhq';
    placement_basis: 'regular_season_ladder';
    notes: null;
    scraped_at: number;
};

/**
 * Maps a grade's flattened standings to result rows. `resolveClubKey` is
 * injected so club-identity assignment (stateful, curated) stays out of this
 * pure module. `resolveSquadNumber` is injected too, so results and
 * `teams.csv` always agree on a team's squad number — including the
 * synthetic disambiguator assigned when two teams collide on the parsed
 * value (see `resolveSquadNumbers` in `run.ts`). Computing it independently
 * here previously caused `team_season_results.csv` to disagree with
 * `teams.csv` and re-collide on the natural key at import time.
 */
export function mapStandingsToResults(
    gradeKey: string,
    standings: readonly Standing[],
    resolveClubKey: (
        organisationId: string,
        organisationName: string,
    ) => string,
    scrapedAt: number,
    resolveSquadNumber: (standing: Standing) => number | null,
): TeamSeasonResultRow[] {
    return standings.map((standing, index) => ({
        grade_key: gradeKey,
        club_key: resolveClubKey(
            standing.team.organisation.id,
            standing.team.organisation.name,
        ),
        squad_number: resolveSquadNumber(standing),
        display_name: standing.team.name,
        ladder_position: index + 1,
        position_uncertain: 0,
        played: standing.played,
        won: standing.won,
        drawn: standing.drawn,
        lost: standing.lost,
        byes: standing.byes,
        goals_for: standing.pointsFor,
        goals_against: standing.pointsAgainst,
        goal_difference: standing.pointsFor - standing.pointsAgainst,
        points: standing.competitionPoints,
        percentage: standing.percentage,
        shots_attempted: null,
        shots_scored: null,
        source: 'playhq',
        placement_basis: 'regular_season_ladder',
        notes: null,
        scraped_at: scrapedAt,
    }));
}
