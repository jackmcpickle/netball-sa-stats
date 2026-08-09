import type {
    ChampionshipRow,
    ChampionshipSeason,
    Club,
    ClubProfile,
    ClubRankSeries,
    Coverage,
    GradeSummary,
    GradeWeightRow,
    Ladder,
    RankPoint,
} from '@/data/types';
/**
 * The only module route loaders read data from.
 *
 * Every function now queries D1 through `getDb()`, which binds `env.DB` from
 * `cloudflare:workers` — so these run inside the Worker, reached from routes via
 * `createServerFn`, and nowhere else. The return types in `@/data/types` are the
 * contract and did not change; the functions became async, which is the only
 * thing the routes had to absorb.
 *
 * The generated `@/data/sample` dataset it replaced has been deleted: nothing
 * imported it any more, and a second source of numbers that nobody reads goes
 * stale silently. It is in the history if the shapes are ever wanted again.
 */
import type { Db } from '@/db';
import {
    CHAMPIONSHIP_TABLE_SPEC,
    fetchChampionshipHistory,
} from '@/db/queries/championship';
import {
    CLUB_RESULTS_TABLE_SPEC,
    fetchClubProfile,
} from '@/db/queries/club-profile';
import { fetchClubs } from '@/db/queries/clubs';
import { buildCoverage, fetchSeasons } from '@/db/queries/coverage';
import {
    fetchGrades,
    fetchLadder,
    LADDER_TABLE_SPEC,
} from '@/db/queries/grades';
import type { RawTableState, TableState } from '@/db/queries/pagination';
import { fetchGradeWeights } from '@/db/queries/weights';
import { Championship } from '@/server/domain/championship';
import { sortClubResults } from '@/server/domain/club-history';
import { Coverage as CoverageDomain } from '@/server/domain/coverage';
import { Ladder as LadderDomain } from '@/server/domain/ladder';
import { TableQuery } from '@/server/domain/table-query';

/** The site now ships the real import rather than generated rows. */
export const IS_SAMPLE_DATA = false;

export async function listClubs(db: Db): Promise<readonly Club[]> {
    return fetchClubs(db);
}

export async function listGrades(
    db: Db,
    year: number,
): Promise<readonly GradeSummary[]> {
    return fetchGrades(db, year);
}

export async function getCoverage(db: Db): Promise<Coverage> {
    return buildCoverage(await fetchSeasons(db), IS_SAMPLE_DATA);
}

/** The most recent season with a complete championship. */
export async function latestRankedYear(db: Db): Promise<number> {
    const result = CoverageDomain.from(
        await fetchSeasons(db),
    ).latestRankedYear();
    if (!result.ok) {
        throw new Error('No ranked seasons');
    }
    return result.value;
}

export async function getChampionshipSeason(
    db: Db,
    year: number,
    state?: RawTableState,
): Promise<
    | (ChampionshipSeason & {
          readonly totalRows: number;
          readonly tableState: TableState;
      })
    | null
> {
    const history = await fetchChampionshipHistory(db);
    const season = history.find((entry) => entry.year === year) ?? null;
    if (!season) {
        return null;
    }
    const championship = Championship.fromHistory(history, year);
    if (!championship.ok) {
        return null;
    }
    const paged = championship.value.sorted(
        TableQuery.from(state ?? {}, CHAMPIONSHIP_TABLE_SPEC),
    );
    return {
        ...season,
        rows: paged.rows,
        totalRows: paged.totalRows,
        tableState: paged.state,
    };
}

/**
 * The ranked year immediately before `year`, or `null` when `year` is the
 * earliest ranked year (or `year` itself is not ranked).
 */
export async function getChampionshipPreviousYear(
    db: Db,
    year: number,
): Promise<number | null> {
    const [history, seasonRows] = await Promise.all([
        fetchChampionshipHistory(db),
        fetchSeasons(db),
    ]);
    const championship = Championship.fromHistory(history, year);
    if (!championship.ok) {
        return null;
    }
    return championship.value.previousYear(CoverageDomain.from(seasonRows));
}

/**
 * Every ranked row for a season, unpaginated. Used where a caller needs to
 * see the whole ranked field at once (e.g. to know which clubs are ranked at
 * all) rather than one page of it — routing that through
 * `getChampionshipSeason`'s default-paginated result would silently hide any
 * ranked club past the first page.
 */
export async function getChampionshipSeasonRows(
    db: Db,
    year: number,
): Promise<readonly ChampionshipRow[]> {
    const history = await fetchChampionshipHistory(db);
    return history.find((entry) => entry.year === year)?.rows ?? [];
}

/**
 * Latest year each club held a championship rank. Drives the "last ranked 2016"
 * line on past-club cards, which answers the question a bare dash provokes.
 */
export async function lastRankedYears(
    db: Db,
): Promise<ReadonlyMap<string, number>> {
    const history = await fetchChampionshipHistory(db);
    const latest = new Map<string, number>();
    for (const season of history) {
        for (const row of season.rows) {
            const seen = latest.get(row.club.key);
            if (seen === undefined || season.year > seen) {
                latest.set(row.club.key, season.year);
            }
        }
    }
    return latest;
}

function seriesPoints(
    history: readonly ChampionshipSeason[],
    key: string,
): readonly RankPoint[] {
    return history.flatMap((season) => {
        const row = season.rows.find((entry) => entry.club.key === key);
        return row
            ? [{ year: season.year, rank: row.rank, points: row.points }]
            : [];
    });
}

/**
 * Rank history for the movement chart, limited to the `limit` clubs with the
 * most career points plus any club the caller wants to keep visible.
 */
export async function getRankSeries(
    db: Db,
    limit: number,
    focusKey?: string,
): Promise<readonly ClubRankSeries[]> {
    const history = await fetchChampionshipHistory(db);
    const careerPoints = new Map<string, number>();
    const clubs = new Map<string, Club>();
    for (const season of history) {
        for (const row of season.rows) {
            careerPoints.set(
                row.club.key,
                (careerPoints.get(row.club.key) ?? 0) + row.points,
            );
            clubs.set(row.club.key, row.club);
        }
    }
    const ordered = [...careerPoints.entries()].sort((a, b) => b[1] - a[1]);
    const keys = ordered.slice(0, limit).map(([key]) => key);
    if (focusKey && !keys.includes(focusKey) && careerPoints.has(focusKey)) {
        keys.push(focusKey);
    }
    return keys.flatMap((key) => {
        const club = clubs.get(key);
        return club ? [{ club, points: seriesPoints(history, key) }] : [];
    });
}

/** Size of the championship field, so the chart axis knows its worst rank. */
export async function championshipSize(db: Db): Promise<number> {
    const history = await fetchChampionshipHistory(db);
    return Math.max(1, ...history.map((season) => season.rows.length));
}

export async function getClubProfile(
    db: Db,
    clubKey: string,
    state?: RawTableState,
): Promise<
    | (ClubProfile & {
          readonly totalRows: number;
          readonly tableState: TableState;
      })
    | null
> {
    const profile = await fetchClubProfile(db, clubKey);
    if (!profile) {
        return null;
    }
    const paged = TableQuery.from(state ?? {}, CLUB_RESULTS_TABLE_SPEC).apply(
        profile.results,
        sortClubResults,
    );
    return {
        ...profile,
        results: paged.rows,
        totalRows: paged.totalRows,
        tableState: paged.state,
    };
}

export async function getLadderFor(
    db: Db,
    gradeKey: string,
    state?: RawTableState,
): Promise<
    | (Ladder & {
          readonly totalRows: number;
          readonly tableState: TableState;
      })
    | null
> {
    const ladder = await fetchLadder(db, gradeKey);
    if (!ladder) {
        return null;
    }
    const paged = LadderDomain.from(ladder.grade, ladder.rows).sorted(
        TableQuery.from(state ?? {}, LADDER_TABLE_SPEC),
    );
    return {
        ...ladder,
        rows: paged.rows,
        totalRows: paged.totalRows,
        tableState: paged.state,
    };
}

export async function listGradeWeights(
    db: Db,
): Promise<readonly GradeWeightRow[]> {
    return fetchGradeWeights(db);
}
