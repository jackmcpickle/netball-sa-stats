import { getClubProfile, listClubs } from '@/data';
import type { Club, ClubProfile } from '@/data/types';
import type { Db } from '@/db';
import type { TableState } from '@/db/queries/pagination';

export interface ClubProfileData {
    readonly profile: ClubProfile & {
        readonly totalRows: number;
        readonly tableState: TableState;
    };
    readonly clubs: readonly Club[];
}

export async function loadClubProfileData(
    db: Db,
    data: {
        clubKey: string;
        sort?: string;
        dir?: 'asc' | 'desc';
        page?: number;
        pageSize?: number;
    },
): Promise<ClubProfileData | null> {
    const profile = await getClubProfile(db, data.clubKey, {
        sort: data.sort,
        dir: data.dir,
        page: data.page,
        pageSize: data.pageSize,
    });
    return profile ? { profile, clubs: await listClubs(db) } : null;
}
