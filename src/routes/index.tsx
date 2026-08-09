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
import type { TableState } from '@/db/queries/pagination';
import { parseOptionalIntParam } from '@/routes/-search-params';
import { tableSearchSchema } from '@/routes/-table-params';

export interface RankingsData {
    readonly coverage: Coverage;
    readonly season: ChampionshipSeason;
    readonly totalRows: number;
    readonly tableState: TableState;
    readonly previousYear: number | null;
    readonly series: readonly ClubRankSeries[];
    readonly worstRank: number;
    readonly clubCount: number;
    readonly gradeCount: number;
}

const searchSchema = tableSearchSchema.extend({
    season: z.preprocess(parseOptionalIntParam, z.number().int().optional()),
});

/**
 * A server function rather than a plain loader body, so Task 6 can swap in
 * database queries without the route or any component changing shape.
 */
const loadRankings = createServerFn({ method: 'GET' })
    .validator(
        z.object({
            season: z.number().int().optional(),
            sort: z.string().optional(),
            dir: z.enum(['asc', 'desc']).optional(),
            page: z.number().int().optional(),
            pageSize: z.number().int().optional(),
        }),
    )
    .handler(async ({ data }): Promise<RankingsData> => {
        const coverage = await getCoverage();
        const year =
            data.season !== undefined &&
            coverage.rankedYears.includes(data.season)
                ? data.season
                : await latestRankedYear();
        const index = coverage.rankedYears.indexOf(year);
        const [season, series, worstRank, clubs, gradesByYear] =
            await Promise.all([
                getChampionshipSeason(year, {
                    sort: data.sort,
                    dir: data.dir,
                    page: data.page,
                    pageSize: data.pageSize,
                }),
                getRankSeries(7),
                championshipSize(),
                listClubs(),
                Promise.all(coverage.years.map(listGrades)),
            ]);
        if (!season) {
            throw new Error(`No championship for ${String(year)}`);
        }
        return {
            coverage,
            season,
            totalRows: season.totalRows,
            tableState: season.tableState,
            previousYear:
                index > 0 ? (coverage.rankedYears[index - 1] ?? null) : null,
            series,
            worstRank,
            clubCount: clubs.length,
            gradeCount: gradesByYear.reduce(
                (total, grades) => total + grades.length,
                0,
            ),
        };
    });

export const Route = createFileRoute('/')({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({
        season: search.season,
        sort: search.sort,
        dir: search.dir,
        page: search.page,
        pageSize: search.pageSize,
    }),
    loader: async ({ deps }) => loadRankings({ data: deps }),
    component: RankingsPage,
});
