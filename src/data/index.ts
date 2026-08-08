import type {
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
import { getDb } from '@/db';
import { fetchChampionshipHistory } from '@/db/queries/championship';
import { fetchClubProfile } from '@/db/queries/club-profile';
import { fetchClubs } from '@/db/queries/clubs';
import { buildCoverage, fetchSeasons } from '@/db/queries/coverage';
import { fetchGrades, fetchLadder } from '@/db/queries/grades';
import { fetchGradeWeights } from '@/db/queries/weights';

/** The site now ships the real import rather than generated rows. */
export const IS_SAMPLE_DATA = false;

export async function listClubs(): Promise<readonly Club[]> {
    return fetchClubs(getDb());
}

export async function listGrades(
    year: number,
): Promise<readonly GradeSummary[]> {
    return fetchGrades(getDb(), year);
}

export async function getCoverage(): Promise<Coverage> {
    return buildCoverage(await fetchSeasons(getDb()), IS_SAMPLE_DATA);
}

/** The most recent season with a complete championship. */
export async function latestRankedYear(): Promise<number> {
    const year = (await getCoverage()).rankedYears.at(-1);
    if (year === undefined) {
        throw new Error('No ranked seasons');
    }
    return year;
}

export async function getChampionshipSeason(
    year: number,
): Promise<ChampionshipSeason | null> {
    const history = await fetchChampionshipHistory(getDb());
    return history.find((season) => season.year === year) ?? null;
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
    limit: number,
    focusKey?: string,
): Promise<readonly ClubRankSeries[]> {
    const history = await fetchChampionshipHistory(getDb());
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
export async function championshipSize(): Promise<number> {
    const history = await fetchChampionshipHistory(getDb());
    return Math.max(1, ...history.map((season) => season.rows.length));
}

export async function getClubProfile(
    clubKey: string,
): Promise<ClubProfile | null> {
    return fetchClubProfile(getDb(), clubKey);
}

export async function getLadderFor(gradeKey: string): Promise<Ladder | null> {
    return fetchLadder(getDb(), gradeKey);
}

export async function listGradeWeights(): Promise<readonly GradeWeightRow[]> {
    return fetchGradeWeights(getDb());
}
