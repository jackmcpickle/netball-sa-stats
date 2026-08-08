import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ClubIndexPage } from '@/components/club/club-index-page';
import { getChampionshipSeason, latestRankedYear, listClubs } from '@/data';
import type { Club } from '@/data/types';

export interface ClubIndexEntry {
    readonly club: Club;
    readonly rank: number | null;
    readonly points: number | null;
    readonly teams: number | null;
}

export interface ClubIndexData {
    readonly year: number;
    readonly entries: readonly ClubIndexEntry[];
}

const loadClubs = createServerFn({ method: 'GET' }).handler(
    (): ClubIndexData => {
        const year = latestRankedYear();
        const season = getChampionshipSeason(year);
        return {
            year,
            entries: listClubs().map((club) => {
                const row = season?.rows.find(
                    (entry) => entry.club.key === club.key,
                );
                return {
                    club,
                    rank: row?.rank ?? null,
                    points: row?.points ?? null,
                    teams: row?.teams ?? null,
                };
            }),
        };
    },
);

export const Route = createFileRoute('/clubs/')({
    loader: async () => loadClubs(),
    component: ClubIndexPage,
});
