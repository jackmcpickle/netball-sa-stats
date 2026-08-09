import type {
    ChampionshipSeason,
    ClubProfile,
    ClubSeasonPoints,
} from '@/data/types';
import type { Db } from '@/db';
import { accentFor } from '@/db/queries/clubs';
import { buildCoverage, fetchSeasons } from '@/db/queries/coverage';
import type { TableSpec } from '@/db/queries/pagination';
import { fetchResults } from '@/db/queries/results';
import type { ResultRow } from '@/db/queries/results';
import { winRate } from '@/pipeline/scoring/championship';
import { ClubHistory, toGradeResults } from '@/server/domain/club-history';
import { fetchChampionshipHistory } from '@/server/repos/championship.repo';

// Only ids with a clickable header in ClubResultsTable belong here: 'played',
// 'lost', and 'points' have comparators but no column of their own (the W-L-D
// record is one combined column, sortable via 'won').
export const CLUB_RESULTS_TABLE_SPEC: TableSpec = {
    sortable: ['year', 'grade', 'position', 'won'],
    defaultSort: 'year',
    defaultDesc: true,
} as const;

interface Record_ {
    readonly won: number;
    readonly games: number;
    readonly hasRecord: boolean;
}

function careerRecord(rows: readonly ResultRow[]): Record_ {
    let won = 0;
    let games = 0;
    let hasRecord = false;
    for (const row of rows) {
        if (row.won === null && row.lost === null && row.drawn === null) {
            continue;
        }
        hasRecord = true;
        won += row.won ?? 0;
        games += (row.won ?? 0) + (row.lost ?? 0) + (row.drawn ?? 0);
    }
    return { won, games, hasRecord };
}

function seasonPoints(
    years: readonly number[],
    ranked: readonly number[],
    history: readonly ChampionshipSeason[],
    clubKey: string,
): readonly ClubSeasonPoints[] {
    return years.map((year): ClubSeasonPoints => {
        if (!ranked.includes(year)) {
            return {
                year,
                points: 0,
                rank: null,
                status: 'in-progress',
            };
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
}

export async function fetchClubProfile(
    db: Db,
    clubKey: string,
): Promise<ClubProfile | null> {
    // Every finish the club has, in-progress seasons included: the results
    // table is a record, not a ranking.
    const rows = await fetchResults(db, { clubKey });
    const first = rows[0];
    if (!first) {
        return null;
    }

    const [history, seasonRows] = await Promise.all([
        fetchChampionshipHistory(db),
        fetchSeasons(db),
    ]);
    const coverage = buildCoverage(seasonRows, false);
    const seasons = seasonPoints(
        coverage.years,
        coverage.rankedYears,
        history,
        clubKey,
    );

    const rankedSeasons = seasons.filter((season) => season.rank !== null);
    const best = rankedSeasons.reduce<ClubSeasonPoints | null>(
        (bestSoFar, season) =>
            bestSoFar === null ||
            (season.rank ?? Infinity) < (bestSoFar.rank ?? Infinity)
                ? season
                : bestSoFar,
        null,
    );
    const record = careerRecord(rows);
    const current = history
        .at(-1)
        ?.rows.find((entry) => entry.club.key === clubKey);
    const club = {
        key: first.clubKey,
        name: first.clubName,
        establishedYear: first.establishedYear,
        homeVenue: first.homeVenue,
        accent: accentFor(first.clubKey),
    };
    const clubHistory = ClubHistory.from(club, rows, coverage.rankedYears);

    return {
        club,
        currentRank: current?.rank ?? null,
        bestRank: best?.rank ?? null,
        bestRankYear: best?.year ?? null,
        careerPoints:
            Math.round(
                rankedSeasons.reduce(
                    (total, season) => total + season.points,
                    0,
                ) * 10,
            ) / 10,
        // Ladder wins only. An uncertain archive placing cannot evidence one.
        minorPremierships: rows.filter(
            (row) => row.ladderPosition === 1 && !row.positionUncertain,
        ).length,
        winPercentage: winRate(record.won, record.games, record.hasRecord),
        gamesPlayed: record.games,
        seasons,
        results: toGradeResults(rows),
        trend: clubHistory.trend(),
    };
}
