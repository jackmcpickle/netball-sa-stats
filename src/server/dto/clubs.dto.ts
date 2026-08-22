import type { Club, Competition } from '@/server/dto/shared.dto';

export interface ClubIndexEntry {
    readonly club: Club;
    readonly rank: number | null;
    readonly points: number | null;
    readonly teams: number | null;
    readonly lastRankedYear: number | null;
}

export interface ClubIndexGroup {
    readonly competition: Competition;
    readonly year: number | null;
    readonly presentCount: number;
    readonly entries: readonly ClubIndexEntry[];
}

export interface ClubIndexParams {
    readonly includePast?: boolean;
}

export interface ClubIndexPageDto {
    readonly year: number;
    readonly includePast: boolean;
    readonly presentCount: number;
    readonly totalCount: number;
    readonly entries: readonly ClubIndexEntry[];
    readonly groups: readonly ClubIndexGroup[];
}

