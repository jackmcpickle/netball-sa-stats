import {
    getChampionshipSeasonRows,
    lastRankedYears,
    latestRankedYear,
    listClubs,
} from '@/data';
import type { Club } from '@/data/types';
import type { Db } from '@/db';
import { ClubDirectory } from '@/server/domain/club-directory';

export interface ClubIndexEntry {
    readonly club: Club;
    readonly rank: number | null;
    readonly points: number | null;
    readonly teams: number | null;
    readonly lastRankedYear: number | null;
}

export interface ClubIndexData {
    readonly year: number;
    readonly includePast: boolean;
    readonly presentCount: number;
    readonly totalCount: number;
    readonly entries: readonly ClubIndexEntry[];
}

export async function loadClubsIndexData(
    db: Db,
    data: { includePast?: boolean },
): Promise<ClubIndexData> {
    const includePast = data.includePast ?? false;
    const year = await latestRankedYear(db);
    const [seasonRows, clubs, lastRanked] = await Promise.all([
        getChampionshipSeasonRows(db, year),
        listClubs(db),
        lastRankedYears(db),
    ]);
    const rankedKeys = new Set(seasonRows.map((row) => row.club.key));
    const { present, past } = ClubDirectory.partition(clubs, rankedKeys);
    const visible = includePast ? [...present, ...past] : present;
    return {
        year,
        includePast,
        presentCount: present.length,
        totalCount: clubs.length,
        entries: visible.map((club) => {
            const row = seasonRows.find((entry) => entry.club.key === club.key);
            return {
                club,
                rank: row?.rank ?? null,
                points: row?.points ?? null,
                teams: row?.teams ?? null,
                lastRankedYear: lastRanked.get(club.key) ?? null,
            };
        }),
    };
}
