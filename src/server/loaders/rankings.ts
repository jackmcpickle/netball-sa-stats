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
import type { Db } from '@/db';
import type { TableState } from '@/db/queries/pagination';

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

export async function loadRankingsData(
    db: Db,
    data: {
        season?: number;
        sort?: string;
        dir?: 'asc' | 'desc';
        page?: number;
        pageSize?: number;
    },
): Promise<RankingsData> {
    const coverage = await getCoverage(db);
    const year =
        data.season !== undefined && coverage.rankedYears.includes(data.season)
            ? data.season
            : await latestRankedYear(db);
    const [season, series, worstRank, clubs, gradesByYear] = await Promise.all([
        getChampionshipSeason(
            db,
            year,
            {
                sort: data.sort,
                dir: data.dir,
                page: data.page,
                pageSize: data.pageSize,
            },
            coverage.rankedYears,
        ),
        getRankSeries(db, 7),
        championshipSize(db),
        listClubs(db),
        Promise.all(
            coverage.years.map(async (gradeYear) => listGrades(db, gradeYear)),
        ),
    ]);
    if (!season) {
        throw new Error(`No championship for ${String(year)}`);
    }
    return {
        coverage,
        season,
        totalRows: season.totalRows,
        tableState: season.tableState,
        previousYear: season.previousYear,
        series,
        worstRank,
        clubCount: clubs.length,
        gradeCount: gradesByYear.reduce(
            (total, grades) => total + grades.length,
            0,
        ),
    };
}
