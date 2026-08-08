import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { RankingsPage } from '@/components/rankings/rankings-page';
import {
    championshipSize,
    getChampionshipSeason,
    getCoverage,
    getRankSeries,
    latestRankedYear,
    listClubs,
    listGrades,
} from '@/data';
import type {
    ChampionshipSeason,
    ClubRankSeries,
    Coverage,
} from '@/data/types';

export interface RankingsData {
    readonly coverage: Coverage;
    readonly season: ChampionshipSeason;
    readonly previousYear: number | null;
    readonly series: readonly ClubRankSeries[];
    readonly worstRank: number;
    readonly clubCount: number;
    readonly gradeCount: number;
}

const searchSchema = z.object({
    season: z.coerce.number().int().optional(),
});

/**
 * A server function rather than a plain loader body, so Task 6 can swap in
 * database queries without the route or any component changing shape.
 */
const loadRankings = createServerFn({ method: 'GET' })
    .validator(z.object({ season: z.number().int().optional() }))
    .handler(({ data }): RankingsData => {
        const coverage = getCoverage();
        const year =
            data.season !== undefined &&
            coverage.rankedYears.includes(data.season)
                ? data.season
                : latestRankedYear();
        const index = coverage.rankedYears.indexOf(year);
        const season = getChampionshipSeason(year);
        if (!season) {
            throw new Error(`No championship for ${String(year)}`);
        }
        return {
            coverage,
            season,
            previousYear:
                index > 0 ? (coverage.rankedYears[index - 1] ?? null) : null,
            series: getRankSeries(7),
            worstRank: championshipSize(),
            clubCount: listClubs().length,
            gradeCount: coverage.years.reduce(
                (total, coveredYear) => total + listGrades(coveredYear).length,
                0,
            ),
        };
    });

export const Route = createFileRoute('/')({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({ season: search.season }),
    loader: async ({ deps }) => loadRankings({ data: { season: deps.season } }),
    component: RankingsPage,
});
