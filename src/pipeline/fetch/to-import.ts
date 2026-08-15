import { isNil, isNull, isUndefined } from 'es-toolkit';
/**
 * Maps snake_case fetch rows to the camelCase `ImportData` the importer
 * already consumes. Field names match `parse.ts`; values are taken from the
 * typed rows directly rather than round-tripped through CSV strings.
 */
import type { CsvValue } from '@/pipeline/csv';
import type { ClubAliasRow, ClubRow } from '@/pipeline/fetch/club-registry';
import type { GradeRow, SeasonRow, TeamRow } from '@/pipeline/fetch/collect';
import type { GameRow } from '@/pipeline/fetch/games';
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

function toNum(value: CsvValue | undefined): number | null {
    if (isNil(value) || value === '') {
        return null;
    }
    return Number(value);
}

function toStr(value: CsvValue | undefined): string | null {
    if (isNil(value) || value === '') {
        return null;
    }
    return String(value);
}

function toBool(value: CsvValue | undefined): boolean {
    return value === 1 || value === '1';
}

function toSeasonRow(row: SeasonRow): SeasonImportRow {
    return {
        competitionKey: row.competition_key,
        seasonKey: row.season_key,
        competitionPeriod: row.competition_period,
        label: row.label,
        startYear: row.start_year,
        endYear: row.end_year,
        isFinal: toBool(row.is_final),
        playhqId: toStr(row.playhq_id),
        source: row.source,
    };
}

function toClubRow(row: ClubRow): ClubImportRow {
    return {
        clubKey: row.club_key,
        name: row.name,
        establishedYear: toNum(row.established_year),
        homeVenue: toStr(row.home_venue),
        playhqId: toStr(row.playhq_id),
    };
}

function toClubAliasRow(row: ClubAliasRow): ClubAliasImportRow {
    return {
        clubKey: row.club_key,
        aliasText: row.alias_text,
        source: row.source,
    };
}

function toGradeRow(row: GradeRow): GradeImportRow {
    return {
        seasonKey: row.season_key,
        gradeKey: row.grade_key,
        name: row.name,
        tier: row.tier,
        division: row.division,
        teamCount: row.team_count,
        ageBand: row.age_band,
        playhqId: toStr(row.playhq_id),
    };
}

function toTeamRow(row: TeamRow): TeamImportRow {
    return {
        clubKey: row.club_key,
        gradeKey: row.grade_key,
        displayName: row.display_name,
        squadNumber: row.squad_number,
        playhqId: toStr(row.playhq_id),
    };
}

function toResultRow(raw: Record<string, CsvValue>): TeamSeasonResultImportRow {
    return {
        gradeKey: String(raw.grade_key ?? ''),
        clubKey: String(raw.club_key ?? ''),
        squadNumber: toNum(raw.squad_number),
        playhqId: toStr(raw.playhq_id),
        displayName: String(raw.display_name ?? ''),
        ladderPosition: Number(raw.ladder_position),
        positionUncertain: toBool(raw.position_uncertain),
        played: toNum(raw.played),
        won: toNum(raw.won),
        drawn: toNum(raw.drawn),
        lost: toNum(raw.lost),
        byes: toNum(raw.byes),
        goalsFor: toNum(raw.goals_for),
        goalsAgainst: toNum(raw.goals_against),
        goalDifference: toNum(raw.goal_difference),
        points: toNum(raw.points),
        percentage: toNum(raw.percentage),
        shotsAttempted: toNum(raw.shots_attempted),
        shotsScored: toNum(raw.shots_scored),
        source: String(raw.source ?? ''),
        placementBasis: String(raw.placement_basis ?? ''),
        notes: toStr(raw.notes),
        scrapedAt: toNum(raw.scraped_at),
    };
}

/**
 * `file` is the games CSV name the importer uses in error messages.
 * Prefer the season start year embedded in `grade_key` (same grouping as
 * `writeGamesCsvs`); fall back to `played_at`'s UTC year.
 */
function gamesFileOf(row: GameRow): string {
    const startYear =
        /-(?:winter|summer|annual)-(?<startYear>\d{4})(?:-|$)/u.exec(
            row.grade_key,
        )?.groups?.startYear;
    if (!isUndefined(startYear)) {
        return `games-${startYear}.csv`;
    }
    if (!isNull(row.played_at)) {
        return `games-${new Date(row.played_at * 1000).getUTCFullYear()}.csv`;
    }
    return 'games-unknown.csv';
}

function toGameImportRow(row: GameRow): GameImportRow {
    return {
        gradeKey: row.grade_key,
        playhqId: row.playhq_id,
        round: row.round,
        roundName: row.round_name,
        isFinals: toBool(row.is_finals),
        playedAt: row.played_at,
        homePlayhqId: row.home_playhq_id,
        awayPlayhqId: row.away_playhq_id,
        homeScore: row.home_score,
        awayScore: row.away_score,
        status: row.status,
        forfeitingSide: row.forfeiting_side,
        source: row.source,
        scrapedAt: row.scraped_at,
        file: gamesFileOf(row),
    };
}

export function toImportData(input: {
    seasons: readonly SeasonRow[];
    clubs: readonly ClubRow[];
    aliases: readonly ClubAliasRow[];
    grades: readonly GradeRow[];
    teams: readonly TeamRow[];
    results: readonly Record<string, CsvValue>[];
    games: readonly GameRow[];
}): ImportData {
    return {
        seasons: input.seasons.map(toSeasonRow),
        clubs: input.clubs.map(toClubRow),
        clubAliases: input.aliases.map(toClubAliasRow),
        grades: input.grades.map(toGradeRow),
        teams: input.teams.map(toTeamRow),
        results: input.results.map(toResultRow),
        games: input.games.map(toGameImportRow),
    };
}
