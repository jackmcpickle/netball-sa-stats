/**
 * Maps snake_case fetch rows to the camelCase `ImportData` the importer
 * already consumes. Field names match `parse.ts`; values are taken from the
 * typed rows directly rather than round-tripped through CSV strings.
 */
import { isNil, isNull, isUndefined } from 'es-toolkit';
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
        competitionPeriod: row.competition_period,
        endYear: row.end_year,
        isFinal: toBool(row.is_final),
        label: row.label,
        playhqId: toStr(row.playhq_id),
        seasonKey: row.season_key,
        source: row.source,
        startYear: row.start_year,
    };
}

function toClubRow(row: ClubRow): ClubImportRow {
    return {
        clubKey: row.club_key,
        establishedYear: toNum(row.established_year),
        homeVenue: toStr(row.home_venue),
        name: row.name,
        playhqId: toStr(row.playhq_id),
    };
}

function toClubAliasRow(row: ClubAliasRow): ClubAliasImportRow {
    return {
        aliasText: row.alias_text,
        clubKey: row.club_key,
        source: row.source,
    };
}

function toGradeRow(row: GradeRow): GradeImportRow {
    return {
        ageBand: row.age_band,
        division: row.division,
        gradeKey: row.grade_key,
        name: row.name,
        playhqId: toStr(row.playhq_id),
        seasonKey: row.season_key,
        teamCount: row.team_count,
        tier: row.tier,
    };
}

function toTeamRow(row: TeamRow): TeamImportRow {
    return {
        clubKey: row.club_key,
        displayName: row.display_name,
        gradeKey: row.grade_key,
        playhqId: toStr(row.playhq_id),
        squadNumber: row.squad_number,
    };
}

function toResultRow(raw: Record<string, CsvValue>): TeamSeasonResultImportRow {
    return {
        byes: toNum(raw.byes),
        clubKey: String(raw.club_key ?? ''),
        displayName: String(raw.display_name ?? ''),
        drawn: toNum(raw.drawn),
        goalDifference: toNum(raw.goal_difference),
        goalsAgainst: toNum(raw.goals_against),
        goalsFor: toNum(raw.goals_for),
        gradeKey: String(raw.grade_key ?? ''),
        ladderPosition: Number(raw.ladder_position),
        lost: toNum(raw.lost),
        notes: toStr(raw.notes),
        percentage: toNum(raw.percentage),
        placementBasis: String(raw.placement_basis ?? ''),
        played: toNum(raw.played),
        playhqId: toStr(raw.playhq_id),
        points: toNum(raw.points),
        positionUncertain: toBool(raw.position_uncertain),
        scrapedAt: toNum(raw.scraped_at),
        shotsAttempted: toNum(raw.shots_attempted),
        shotsScored: toNum(raw.shots_scored),
        source: String(raw.source ?? ''),
        squadNumber: toNum(raw.squad_number),
        won: toNum(raw.won),
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
        awayPlayhqId: row.away_playhq_id,
        awayScore: row.away_score,
        file: gamesFileOf(row),
        forfeitingSide: row.forfeiting_side,
        gradeKey: row.grade_key,
        homePlayhqId: row.home_playhq_id,
        homeScore: row.home_score,
        isFinals: toBool(row.is_finals),
        playedAt: row.played_at,
        playhqId: row.playhq_id,
        round: row.round,
        roundName: row.round_name,
        scrapedAt: row.scraped_at,
        source: row.source,
        status: row.status,
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
        clubAliases: input.aliases.map(toClubAliasRow),
        clubs: input.clubs.map(toClubRow),
        games: input.games.map(toGameImportRow),
        grades: input.grades.map(toGradeRow),
        results: input.results.map(toResultRow),
        seasons: input.seasons.map(toSeasonRow),
        teams: input.teams.map(toTeamRow),
    };
}
