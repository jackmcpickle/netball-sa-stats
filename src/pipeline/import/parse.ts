/** Raw CSV string rows -> typed import rows. No validation here, just coercion. */
import type {
    ClubAliasImportRow,
    ClubImportRow,
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
        seasonKey: raw.season_key ?? '',
        competitionPeriod: raw.competition_period ?? '',
        label: raw.label ?? '',
        startYear: Number(raw.start_year),
        endYear: Number(raw.end_year),
        isFinal: bool(raw.is_final ?? ''),
        playhqId: str(raw.playhq_id ?? ''),
        source: raw.source ?? '',
    };
}

export function parseClubRow(raw: RawRow): ClubImportRow {
    return {
        clubKey: raw.club_key ?? '',
        name: raw.name ?? '',
        establishedYear: num(raw.established_year ?? ''),
        homeVenue: str(raw.home_venue ?? ''),
        playhqId: str(raw.playhq_id ?? ''),
    };
}

export function parseClubAliasRow(raw: RawRow): ClubAliasImportRow {
    return {
        clubKey: raw.club_key ?? '',
        aliasText: raw.alias_text ?? '',
        source: raw.source ?? '',
    };
}

export function parseGradeRow(raw: RawRow): GradeImportRow {
    return {
        seasonKey: raw.season_key ?? '',
        gradeKey: raw.grade_key ?? '',
        name: raw.name ?? '',
        tier: Number(raw.tier),
        division: num(raw.division ?? ''),
        teamCount: Number(raw.team_count),
        ageBand: str(raw.age_band ?? ''),
        playhqId: str(raw.playhq_id ?? ''),
    };
}

export function parseTeamRow(raw: RawRow): TeamImportRow {
    return {
        clubKey: raw.club_key ?? '',
        gradeKey: raw.grade_key ?? '',
        displayName: raw.display_name ?? '',
        squadNumber: num(raw.squad_number ?? ''),
        playhqId: str(raw.playhq_id ?? ''),
    };
}

type ResultTally = Pick<
    TeamSeasonResultImportRow,
    'played' | 'won' | 'drawn' | 'lost' | 'byes'
>;

function parseResultTally(raw: RawRow): ResultTally {
    return {
        played: num(raw.played ?? ''),
        won: num(raw.won ?? ''),
        drawn: num(raw.drawn ?? ''),
        lost: num(raw.lost ?? ''),
        byes: num(raw.byes ?? ''),
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
        goalsFor: num(raw.goals_for ?? ''),
        goalsAgainst: num(raw.goals_against ?? ''),
        goalDifference: num(raw.goal_difference ?? ''),
        points: num(raw.points ?? ''),
        percentage: num(raw.percentage ?? ''),
        shotsAttempted: num(raw.shots_attempted ?? ''),
        shotsScored: num(raw.shots_scored ?? ''),
    };
}

export function parseTeamSeasonResultRow(
    raw: RawRow,
): TeamSeasonResultImportRow {
    return {
        gradeKey: raw.grade_key ?? '',
        clubKey: raw.club_key ?? '',
        squadNumber: num(raw.squad_number ?? ''),
        playhqId: str(raw.playhq_id ?? ''),
        displayName: raw.display_name ?? '',
        ladderPosition: Number(raw.ladder_position),
        positionUncertain: bool(raw.position_uncertain ?? ''),
        ...parseResultTally(raw),
        ...parseResultScoring(raw),
        source: raw.source ?? '',
        placementBasis: raw.placement_basis ?? '',
        notes: str(raw.notes ?? ''),
        scrapedAt: num(raw.scraped_at ?? ''),
    };
}
