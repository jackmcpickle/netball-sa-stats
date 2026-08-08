/**
 * The only module route loaders read data from.
 *
 * Today every function is served by the deterministic sample dataset. Task 6
 * replaces the bodies with database queries; the return types in
 * `@/data/types` are the contract, so no component changes.
 */
import {
    CLUBS,
    COMPETITIONS,
    GRADES,
    GRADE_WEIGHTS,
    RANKED_YEARS,
    YEARS,
    getChampionship,
    getChampionshipHistory,
    getClub,
    getClubResults,
    getLadder,
} from '@/data/sample';
import type {
    ChampionshipSeason,
    Club,
    ClubProfile,
    ClubRankSeries,
    ClubSeasonPoints,
    Coverage,
    GradeSummary,
    GradeWeightRow,
    Ladder,
    RankPoint,
    SeasonStatus,
} from '@/data/types';

/** Flip to false in Task 6, when real rows replace the generated ones. */
export const IS_SAMPLE_DATA = true;

export function listClubs(): readonly Club[] {
    return [...CLUBS].sort((a, b) => a.name.localeCompare(b.name));
}

export function listGrades(year: number): readonly GradeSummary[] {
    return GRADES.filter((grade) => grade.year === year);
}

export function getCoverage(): Coverage {
    return {
        years: YEARS,
        rankedYears: RANKED_YEARS,
        isSampleData: IS_SAMPLE_DATA,
        competitions: COMPETITIONS.map((competition) => ({
            competition,
            seasons: YEARS.map((year) => {
                // Premier League and its Reserves did not run in 2022 — a
                // real-world absence, not a hole in the data.
                if (competition.key !== 'amnd' && year === 2022) {
                    return {
                        year,
                        status: 'absent' as SeasonStatus,
                        note: 'No season — the competition did not run in 2022.',
                    };
                }
                if (!RANKED_YEARS.includes(year)) {
                    return {
                        year,
                        status: 'in-progress' as SeasonStatus,
                        note: 'Season still being played, so it is not ranked yet.',
                    };
                }
                return { year, status: 'ranked' as SeasonStatus, note: null };
            }),
        })),
    };
}

/** The most recent season with a complete championship. */
export function latestRankedYear(): number {
    const year = RANKED_YEARS.at(-1);
    if (year === undefined) {
        throw new Error('No ranked seasons');
    }
    return year;
}

export function getChampionshipSeason(year: number): ChampionshipSeason | null {
    return getChampionship(year);
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
export function getRankSeries(
    limit: number,
    focusKey?: string,
): readonly ClubRankSeries[] {
    const history = getChampionshipHistory();
    const careerPoints = new Map<string, number>();
    for (const season of history) {
        for (const row of season.rows) {
            careerPoints.set(
                row.club.key,
                (careerPoints.get(row.club.key) ?? 0) + row.points,
            );
        }
    }
    const ordered = [...careerPoints.entries()].sort((a, b) => b[1] - a[1]);
    const keys = ordered.slice(0, limit).map(([key]) => key);
    if (focusKey && !keys.includes(focusKey) && careerPoints.has(focusKey)) {
        keys.push(focusKey);
    }
    return keys.flatMap((key) => {
        const club = getClub(key);
        return club ? [{ club, points: seriesPoints(history, key) }] : [];
    });
}

/** Size of the championship field, so the chart axis knows its worst rank. */
export function championshipSize(): number {
    return Math.max(
        1,
        ...getChampionshipHistory().map((season) => season.rows.length),
    );
}

export function getClubProfile(clubKey: string): ClubProfile | null {
    const club = getClub(clubKey);
    if (!club) {
        return null;
    }
    const history = getChampionshipHistory();
    const seasons: ClubSeasonPoints[] = YEARS.map((year) => {
        if (!RANKED_YEARS.includes(year)) {
            return { year, points: 0, rank: null, status: 'in-progress' };
        }
        const row = history
            .find((season) => season.year === year)
            ?.rows.find((entry) => entry.club.key === clubKey);
        return {
            year,
            points: row?.points ?? 0,
            rank: row?.rank ?? null,
            status: 'ranked',
        };
    });

    const ranked = seasons.filter((season) => season.rank !== null);
    const best = ranked.reduce<ClubSeasonPoints | null>(
        (bestSoFar, season) =>
            bestSoFar === null ||
            (season.rank ?? Infinity) < (bestSoFar.rank ?? Infinity)
                ? season
                : bestSoFar,
        null,
    );

    const results = getClubResults(clubKey);
    let won = 0;
    let games = 0;
    for (const result of results) {
        won += result.won ?? 0;
        games += (result.won ?? 0) + (result.lost ?? 0) + (result.drawn ?? 0);
    }

    const currentSeason = history.at(-1);
    const currentRow = currentSeason?.rows.find(
        (entry) => entry.club.key === clubKey,
    );

    return {
        club,
        currentRank: currentRow?.rank ?? null,
        bestRank: best?.rank ?? null,
        bestRankYear: best?.year ?? null,
        careerPoints:
            Math.round(
                ranked.reduce((total, season) => total + season.points, 0) * 10,
            ) / 10,
        minorPremierships: results.filter(
            (result) => result.ladderPosition === 1,
        ).length,
        winPercentage: games > 0 ? Math.round((won / games) * 1000) / 10 : null,
        gamesPlayed: games,
        seasons,
        results,
    };
}

export function getLadderFor(gradeKey: string): Ladder | null {
    return GRADES.some((grade) => grade.key === gradeKey)
        ? getLadder(gradeKey)
        : null;
}

export function listGradeWeights(): readonly GradeWeightRow[] {
    return [...GRADE_WEIGHTS].sort(
        (a, b) => a.tier - b.tier || (a.division ?? 0) - (b.division ?? 0),
    );
}
