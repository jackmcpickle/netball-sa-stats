import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ClubIndexPage } from '@/components/club/club-index-page';
import {
    getChampionshipSeasonRows,
    lastRankedYears,
    latestRankedYear,
    listClubs,
} from '@/data';
import type { Club } from '@/data/types';
import { partitionClubs } from '@/db/queries/club-activity';
import { parseOptionalBoolParam } from '@/routes/-search-params';

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

const searchSchema = z.object({
    includePast: z.preprocess(parseOptionalBoolParam, z.boolean().optional()),
});

const loadClubs = createServerFn({ method: 'GET' })
    .validator(z.object({ includePast: z.boolean().optional() }))
    .handler(async ({ data }): Promise<ClubIndexData> => {
        const includePast = data.includePast ?? false;
        const year = await latestRankedYear();
        const [seasonRows, clubs, lastRanked] = await Promise.all([
            getChampionshipSeasonRows(year),
            listClubs(),
            lastRankedYears(),
        ]);
        const rankedKeys = new Set(seasonRows.map((row) => row.club.key));
        const { present, past } = partitionClubs(clubs, rankedKeys);
        const visible = includePast ? [...present, ...past] : present;
        return {
            year,
            includePast,
            presentCount: present.length,
            totalCount: clubs.length,
            entries: visible.map((club) => {
                const row = seasonRows.find(
                    (entry) => entry.club.key === club.key,
                );
                return {
                    club,
                    rank: row?.rank ?? null,
                    points: row?.points ?? null,
                    teams: row?.teams ?? null,
                    lastRankedYear: lastRanked.get(club.key) ?? null,
                };
            }),
        };
    });

export const Route = createFileRoute('/clubs/')({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({ includePast: search.includePast }),
    loader: async ({ deps }) =>
        loadClubs({ data: { includePast: deps.includePast } }),
    component: ClubIndexPage,
});
