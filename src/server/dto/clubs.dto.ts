import type { Club } from '@/server/dto/shared.dto';

export type ClubIndexEntry = {
    readonly club: Club;
    readonly rank: number | null;
    readonly points: number | null;
    readonly teams: number | null;
    readonly lastRankedYear: number | null;
};

export type ClubIndexParams = {
    readonly includePast?: boolean;
};

export type ClubIndexPageDto = {
    readonly year: number;
    readonly includePast: boolean;
    readonly presentCount: number;
    readonly totalCount: number;
    readonly entries: readonly ClubIndexEntry[];
};
