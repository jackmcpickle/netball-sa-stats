import { sqlBool, sqlNumber, sqlText } from '@/pipeline/import/sql-format';
/**
 * Typed, validated import rows -> upsert SQL. Parents are resolved by
 * subquery on their natural key (same pattern as `drizzle/0001_seed.sql`), so
 * no integer ids need to exist in this process — D1 resolves them when the
 * statement runs. This is what makes the generated SQL safe to run against
 * local or remote D1 with the exact same text.
 *
 * `teams` identity is `(grade, playhq_id)` — PlayHQ's own stable team id,
 * never a synthetic index. squad_number is display-only. SQLite's UNIQUE
 * index treats NULL <> NULL, and playhq_id is expected to always be present
 * for scraped rows, but we still match with `IS` (NULL-safe) defensively,
 * via an insert-if-missing followed by an always-update.
 */
import type {
    ClubAliasImportRow,
    ClubImportRow,
    GameImportRow,
    GradeImportRow,
    ImportData,
    SeasonImportRow,
    TeamImportRow,
    TeamSeasonResultImportRow,
} from '@/pipeline/import/types';

export const DEFAULT_CHUNK_SIZE = 100;

export type SqlBatch = {
    table: string;
    statements: string[];
};

function seasonStatement(row: SeasonImportRow): string {
    return `INSERT INTO seasons (competition_id, season_key, competition_period, label, start_year, end_year, is_final, playhq_id, source) SELECT c.id, ${sqlText(row.seasonKey)}, ${sqlText(row.competitionPeriod)}, ${sqlText(row.label)}, ${sqlNumber(row.startYear)}, ${sqlNumber(row.endYear)}, ${sqlBool(row.isFinal)}, ${sqlText(row.playhqId)}, ${sqlText(row.source)} FROM competitions c WHERE c.key = ${sqlText(row.competitionKey)} ON CONFLICT(season_key) DO UPDATE SET competition_id = excluded.competition_id, competition_period = excluded.competition_period, label = excluded.label, start_year = excluded.start_year, end_year = excluded.end_year, is_final = excluded.is_final, playhq_id = excluded.playhq_id, source = excluded.source;`;
}

function clubStatement(row: ClubImportRow): string {
    return `INSERT INTO clubs (club_key, name, established_year, home_venue, playhq_id) VALUES (${sqlText(row.clubKey)}, ${sqlText(row.name)}, ${sqlNumber(row.establishedYear)}, ${sqlText(row.homeVenue)}, ${sqlText(row.playhqId)}) ON CONFLICT(club_key) DO UPDATE SET name = excluded.name, established_year = excluded.established_year, home_venue = excluded.home_venue, playhq_id = excluded.playhq_id;`;
}

function clubAliasStatement(row: ClubAliasImportRow): string {
    return `INSERT INTO club_aliases (club_id, alias_text, source) SELECT cl.id, ${sqlText(row.aliasText)}, ${sqlText(row.source)} FROM clubs cl WHERE cl.club_key = ${sqlText(row.clubKey)} ON CONFLICT(alias_text) DO UPDATE SET club_id = excluded.club_id, source = excluded.source;`;
}

function gradeStatement(row: GradeImportRow): string {
    return `INSERT INTO grades (season_id, grade_key, name, tier, division, team_count, age_band, playhq_id) SELECT s.id, ${sqlText(row.gradeKey)}, ${sqlText(row.name)}, ${sqlNumber(row.tier)}, ${sqlNumber(row.division)}, ${sqlNumber(row.teamCount)}, ${sqlText(row.ageBand)}, ${sqlText(row.playhqId)} FROM seasons s WHERE s.season_key = ${sqlText(row.seasonKey)} ON CONFLICT(grade_key) DO UPDATE SET season_id = excluded.season_id, name = excluded.name, tier = excluded.tier, division = excluded.division, team_count = excluded.team_count, age_band = excluded.age_band, playhq_id = excluded.playhq_id;`;
}

function teamStatements(row: TeamImportRow): string[] {
    const clubSubquery = `(SELECT id FROM clubs WHERE club_key = ${sqlText(row.clubKey)})`;
    const gradeSubquery = `(SELECT id FROM grades WHERE grade_key = ${sqlText(row.gradeKey)})`;
    const match = `grade_id = ${gradeSubquery} AND playhq_id IS ${sqlText(row.playhqId)}`;
    const insert = `INSERT INTO teams (club_id, grade_id, display_name, squad_number, playhq_id) SELECT ${clubSubquery}, ${gradeSubquery}, ${sqlText(row.displayName)}, ${sqlNumber(row.squadNumber)}, ${sqlText(row.playhqId)} WHERE NOT EXISTS (SELECT 1 FROM teams WHERE ${match});`;
    const update = `UPDATE teams SET club_id = ${clubSubquery}, display_name = ${sqlText(row.displayName)}, squad_number = ${sqlNumber(row.squadNumber)} WHERE ${match};`;
    return [insert, update];
}

function resultStatement(row: TeamSeasonResultImportRow): string {
    const teamSubquery = `(SELECT id FROM teams WHERE grade_id = (SELECT id FROM grades WHERE grade_key = ${sqlText(row.gradeKey)}) AND playhq_id IS ${sqlText(row.playhqId)})`;
    const gradeSubquery = `(SELECT id FROM grades WHERE grade_key = ${sqlText(row.gradeKey)})`;
    return `INSERT INTO team_season_results (team_id, grade_id, ladder_position, position_uncertain, played, won, drawn, lost, byes, goals_for, goals_against, goal_difference, points, percentage, shots_attempted, shots_scored, source, placement_basis, notes, scraped_at) SELECT ${teamSubquery}, ${gradeSubquery}, ${sqlNumber(row.ladderPosition)}, ${sqlBool(row.positionUncertain)}, ${sqlNumber(row.played)}, ${sqlNumber(row.won)}, ${sqlNumber(row.drawn)}, ${sqlNumber(row.lost)}, ${sqlNumber(row.byes)}, ${sqlNumber(row.goalsFor)}, ${sqlNumber(row.goalsAgainst)}, ${sqlNumber(row.goalDifference)}, ${sqlNumber(row.points)}, ${sqlNumber(row.percentage)}, ${sqlNumber(row.shotsAttempted)}, ${sqlNumber(row.shotsScored)}, ${sqlText(row.source)}, ${sqlText(row.placementBasis)}, ${sqlText(row.notes)}, ${sqlNumber(row.scrapedAt)} ON CONFLICT(team_id, grade_id) DO UPDATE SET ladder_position = excluded.ladder_position, position_uncertain = excluded.position_uncertain, played = excluded.played, won = excluded.won, drawn = excluded.drawn, lost = excluded.lost, byes = excluded.byes, goals_for = excluded.goals_for, goals_against = excluded.goals_against, goal_difference = excluded.goal_difference, points = excluded.points, percentage = excluded.percentage, shots_attempted = excluded.shots_attempted, shots_scored = excluded.shots_scored, source = excluded.source, placement_basis = excluded.placement_basis, notes = excluded.notes, scraped_at = excluded.scraped_at;`;
}

/**
 * Resolved by PlayHQ team id alone, *not* grade-scoped like the results are:
 * a team regraded after junior grading rounds plays games in a grade whose
 * ladder it never appears on. PlayHQ team ids are globally unique, which
 * `checkTeamIdsGloballyUnique` enforces before this runs. A bye's away side
 * is genuinely NULL, so the subquery is omitted entirely.
 */
function gameTeamSubquery(playhqId: string | null): string {
    if (playhqId === null) return 'NULL';
    return `(SELECT id FROM teams WHERE playhq_id IS ${sqlText(playhqId)})`;
}

function gameStatement(row: GameImportRow): string {
    const gradeSubquery = `(SELECT id FROM grades WHERE grade_key = ${sqlText(row.gradeKey)})`;
    return `INSERT INTO games (grade_id, playhq_id, round, round_name, is_finals, played_at, home_team_id, away_team_id, home_score, away_score, status, forfeiting_side, source, scraped_at) VALUES (${gradeSubquery}, ${sqlText(row.playhqId)}, ${sqlNumber(row.round)}, ${sqlText(row.roundName)}, ${sqlBool(row.isFinals)}, ${sqlNumber(row.playedAt)}, ${gameTeamSubquery(row.homePlayhqId)}, ${gameTeamSubquery(row.awayPlayhqId)}, ${sqlNumber(row.homeScore)}, ${sqlNumber(row.awayScore)}, ${sqlText(row.status)}, ${sqlText(row.forfeitingSide)}, ${sqlText(row.source)}, ${sqlNumber(row.scrapedAt)}) ON CONFLICT(grade_id, playhq_id) DO UPDATE SET round = excluded.round, round_name = excluded.round_name, is_finals = excluded.is_finals, played_at = excluded.played_at, home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id, home_score = excluded.home_score, away_score = excluded.away_score, status = excluded.status, forfeiting_side = excluded.forfeiting_side, source = excluded.source, scraped_at = excluded.scraped_at;`;
}

function chunkStatements(
    table: string,
    statements: string[],
    chunkSize: number,
): SqlBatch[] {
    const batches: SqlBatch[] = [];
    for (let i = 0; i < statements.length; i += chunkSize) {
        batches.push({
            table,
            statements: statements.slice(i, i + chunkSize),
        });
    }
    return batches;
}

/** One batch per table, in dependency order, chunked to stay under D1's per-batch statement limit. */
export function generateImportSql(
    data: ImportData,
    chunkSize: number = DEFAULT_CHUNK_SIZE,
): SqlBatch[] {
    return [
        ...chunkStatements(
            'seasons',
            data.seasons.map(seasonStatement),
            chunkSize,
        ),
        ...chunkStatements('clubs', data.clubs.map(clubStatement), chunkSize),
        ...chunkStatements(
            'club_aliases',
            data.clubAliases.map(clubAliasStatement),
            chunkSize,
        ),
        ...chunkStatements(
            'grades',
            data.grades.map(gradeStatement),
            chunkSize,
        ),
        ...chunkStatements(
            'teams',
            data.teams.flatMap(teamStatements),
            chunkSize,
        ),
        ...chunkStatements(
            'team_season_results',
            data.results.map(resultStatement),
            chunkSize,
        ),
        // After teams: games reference them.
        ...chunkStatements('games', data.games.map(gameStatement), chunkSize),
    ];
}
