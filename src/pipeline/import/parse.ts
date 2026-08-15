/** Raw CSV string rows -> typed import rows. No validation here, just coercion. */
import type {
    ClubAliasImportRow,
    ClubImportRow,
    GameImportRow,
    GradeImportRow,
    RawRow,
    SeasonImportRow,
    TeamImportRow,
    TeamSeasonResultImportRow,
} from '@/pipeline/import/types';

function str(raw: string): string | null {
    return raw === '' ? null : raw;
}

function num(raw: string): number | null {
    return raw === '' ? null : Number(raw);
}

function bool(raw: string): boolean {
    return raw === '1';
}

export function parseSeasonRow(raw: RawRow): SeasonImportRow {
    return {
        competitionKey: raw.competition_key ?? '',
        competitionPeriod: raw.competition_period ?? '',
        endYear: Number(raw.end_year),
        isFinal: bool(raw.is_final ?? ''),
        label: raw.label ?? '',
        playhqId: str(raw.playhq_id ?? ''),
        seasonKey: raw.season_key ?? '',
        source: raw.source ?? '',
        startYear: Number(raw.start_year),
    };
}

export function parseClubRow(raw: RawRow): ClubImportRow {
    return {
        clubKey: raw.club_key ?? '',
        establishedYear: num(raw.established_year ?? ''),
        homeVenue: str(raw.home_venue ?? ''),
        name: raw.name ?? '',
        playhqId: str(raw.playhq_id ?? ''),
    };
}

export function parseClubAliasRow(raw: RawRow): ClubAliasImportRow {
    return {
        aliasText: raw.alias_text ?? '',
        clubKey: raw.club_key ?? '',
        source: raw.source ?? '',
    };
}

export function parseGradeRow(raw: RawRow): GradeImportRow {
    return {
        ageBand: str(raw.age_band ?? ''),
        division: num(raw.division ?? ''),
        gradeKey: raw.grade_key ?? '',
        name: raw.name ?? '',
        playhqId: str(raw.playhq_id ?? ''),
        seasonKey: raw.season_key ?? '',
        teamCount: Number(raw.team_count),
        tier: Number(raw.tier),
    };
}

export function parseTeamRow(raw: RawRow): TeamImportRow {
    return {
        clubKey: raw.club_key ?? '',
        displayName: raw.display_name ?? '',
        gradeKey: raw.grade_key ?? '',
        playhqId: str(raw.playhq_id ?? ''),
        squadNumber: num(raw.squad_number ?? ''),
    };
}

export function parseGameRow(raw: RawRow, file: string): GameImportRow {
    return {
        awayPlayhqId: str(raw.away_playhq_id ?? ''),
        awayScore: num(raw.away_score ?? ''),
        file,
        forfeitingSide: str(raw.forfeiting_side ?? ''),
        gradeKey: raw.grade_key ?? '',
        homePlayhqId: str(raw.home_playhq_id ?? ''),
        homeScore: num(raw.home_score ?? ''),
        isFinals: bool(raw.is_finals ?? ''),
        playedAt: num(raw.played_at ?? ''),
        playhqId: raw.playhq_id ?? '',
        round: num(raw.round ?? ''),
        roundName: str(raw.round_name ?? ''),
        scrapedAt: num(raw.scraped_at ?? ''),
        source: raw.source ?? '',
        status: raw.status ?? '',
    };
}

type ResultTally = Pick<
    TeamSeasonResultImportRow,
    'played' | 'won' | 'drawn' | 'lost' | 'byes'
>;

function parseResultTally(raw: RawRow): ResultTally {
    return {
        byes: num(raw.byes ?? ''),
        drawn: num(raw.drawn ?? ''),
        lost: num(raw.lost ?? ''),
        played: num(raw.played ?? ''),
        won: num(raw.won ?? ''),
    };
}

type ResultScoring = Pick<
    TeamSeasonResultImportRow,
    | 'goalsFor'
    | 'goalsAgainst'
    | 'goalDifference'
    | 'points'
    | 'percentage'
    | 'shotsAttempted'
    | 'shotsScored'
>;

function parseResultScoring(raw: RawRow): ResultScoring {
    return {
        goalDifference: num(raw.goal_difference ?? ''),
        goalsAgainst: num(raw.goals_against ?? ''),
        goalsFor: num(raw.goals_for ?? ''),
        percentage: num(raw.percentage ?? ''),
        points: num(raw.points ?? ''),
        shotsAttempted: num(raw.shots_attempted ?? ''),
        shotsScored: num(raw.shots_scored ?? ''),
    };
}

export function parseTeamSeasonResultRow(
    raw: RawRow,
): TeamSeasonResultImportRow {
    return {
        clubKey: raw.club_key ?? '',
        displayName: raw.display_name ?? '',
        gradeKey: raw.grade_key ?? '',
        ladderPosition: Number(raw.ladder_position),
        playhqId: str(raw.playhq_id ?? ''),
        positionUncertain: bool(raw.position_uncertain ?? ''),
        squadNumber: num(raw.squad_number ?? ''),
        ...parseResultTally(raw),
        ...parseResultScoring(raw),
        notes: str(raw.notes ?? ''),
        placementBasis: raw.placement_basis ?? '',
        scrapedAt: num(raw.scraped_at ?? ''),
        source: raw.source ?? '',
    };
}
