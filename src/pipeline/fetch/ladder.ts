import type { CsvValue } from '@/pipeline/csv';
/**
 * Pure mapping from a `gradeLadder` response's standings to
 * `team_season_results` CSV rows. No network, no filesystem — fixture-tested
 * against the committed `data/raw/probe/gradeLadder_*.json` captures.
 */

export interface Standing {
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
}

export interface LadderPool {
    pool: { id: string; name: string } | null;
    standings: readonly Standing[];
}

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
    /** PlayHQ's stable team id — the natural key `teams.csv` is resolved by. */
    playhq_id: string;
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
 * `teams.csv` always agree on a team's *display* squad number. `playhq_id`
 * (the actual team-identity key the importer resolves rows by) is taken
 * directly from the standing — it's PlayHQ's own stable id, never derived.
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
        byes: standing.byes,
        club_key: resolveClubKey(
            standing.team.organisation.id,
            standing.team.organisation.name,
        ),
        display_name: standing.team.name,
        drawn: standing.drawn,
        goal_difference: standing.pointsFor - standing.pointsAgainst,
        goals_against: standing.pointsAgainst,
        goals_for: standing.pointsFor,
        grade_key: gradeKey,
        ladder_position: index + 1,
        lost: standing.lost,
        notes: null,
        percentage: standing.percentage,
        placement_basis: 'regular_season_ladder',
        played: standing.played,
        playhq_id: standing.team.id,
        points: standing.competitionPoints,
        position_uncertain: 0,
        scraped_at: scrapedAt,
        shots_attempted: null,
        shots_scored: null,
        source: 'playhq',
        squad_number: resolveSquadNumber(standing),
        won: standing.won,
    }));
}
