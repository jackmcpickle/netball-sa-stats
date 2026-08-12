import type { TableState } from '@/db/queries/pagination';
import type { Club, GradeKey, SeasonStatus } from '@/server/dto/shared.dto';

/** One team's finish in one grade, for the club profile table. */
export interface ClubGradeResult {
    readonly year: number;
    readonly gradeKey: GradeKey;
    readonly gradeName: string;
    readonly competitionName: string;
    readonly ladderPosition: number;
    readonly teamCount: number;
    readonly won: number | null;
    readonly lost: number | null;
    readonly drawn: number | null;
    readonly percentage: number | null;
    /** Provenance note, e.g. PlayHQ's played count not reconciling with W+D+L. */
    readonly notes: string | null;
}

/** One bar in the championship-points-by-season chart. */
export interface ClubSeasonPoints {
    readonly year: number;
    readonly points: number;
    /** Null when the club fielded no team, or the year is not yet ranked. */
    readonly rank: number | null;
    readonly status: SeasonStatus;
}

export interface ClubTrendPoint {
    readonly year: number;
    /** 0..1, 1 being top of every grade. Null when nothing was measurable. */
    readonly strength: number | null;
    /** Teams fielded. Zero is meaningful here: the club sat the season out. */
    readonly teams: number;
}

export interface ClubBandTrend {
    readonly tier: number;
    readonly label: string;
    readonly points: readonly ClubTrendPoint[];
}

export interface ClubTrend {
    readonly overall: readonly ClubTrendPoint[];
    readonly bands: readonly ClubBandTrend[];
}

export interface ClubProfile {
    readonly club: Club;
    readonly currentRank: number | null;
    readonly bestRank: number | null;
    readonly bestRankYear: number | null;
    readonly careerPoints: number;
    readonly minorPremierships: number;
    readonly winPercentage: number | null;
    readonly gamesPlayed: number;
    readonly seasons: readonly ClubSeasonPoints[];
    readonly results: readonly ClubGradeResult[];
    readonly trend: ClubTrend;
}

export interface ClubProfileParams {
    readonly clubKey: string;
    readonly sort?: string;
    readonly dir?: 'asc' | 'desc';
    readonly page?: number;
    readonly pageSize?: number;
}

export interface ClubProfilePageDto {
    readonly profile: ClubProfile & {
        readonly totalRows: number;
        readonly tableState: TableState;
    };
    readonly clubs: readonly Club[];
}
