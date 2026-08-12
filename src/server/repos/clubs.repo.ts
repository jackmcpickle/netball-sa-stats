/**
 * Fetches clubs and hands them (or one club's results) to the domain layer:
 * the club index (`fetchClubs`) and a single club's profile
 * (`fetchClubProfile`). `src/db/queries/clubs.ts` keeps only the table spec,
 * alongside the specs for the other tables.
 */
import { asc } from 'drizzle-orm';
import type { Db } from '@/db';
import { buildCoverage, fetchSeasons } from '@/db/queries/coverage';
import { fetchResults } from '@/db/queries/results';
import type { ResultRow } from '@/db/queries/results';
import { clubs } from '@/db/schema';
import { winRate } from '@/pipeline/scoring/championship';
import { ClubHistory, toGradeResults } from '@/server/domain/club-history';
import type {
    ClubProfile,
    ClubSeasonPoints,
} from '@/server/dto/club-profile.dto';
import type { ChampionshipSeason } from '@/server/dto/rankings.dto';
import type { Club } from '@/server/dto/shared.dto';
import { fetchChampionshipHistory } from '@/server/repos/championship.repo';
import { accentFor } from '@/server/repos/club-accent';

export interface ClubRow {
    readonly id: number;
    readonly clubKey: string;
    readonly name: string;
    readonly establishedYear: number | null;
    readonly homeVenue: string | null;
}

export function toClub(row: ClubRow): Club {
    return {
        key: row.clubKey,
        name: row.name,
        establishedYear: row.establishedYear,
        homeVenue: row.homeVenue,
        accent: accentFor(row.clubKey),
    };
}

export async function fetchClubs(db: Db): Promise<readonly Club[]> {
    const rows = await db
        .select({
            id: clubs.id,
            clubKey: clubs.clubKey,
            name: clubs.name,
            establishedYear: clubs.establishedYear,
            homeVenue: clubs.homeVenue,
        })
        .from(clubs)
        .orderBy(asc(clubs.name));
    return rows.map(toClub);
}

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
    const clubHistory = ClubHistory.from(rows, coverage.rankedYears);

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

export function createClubsRepo(db: Db): {
    all(): Promise<readonly Club[]>;
    profile(clubKey: string): Promise<ClubProfile | null>;
} {
    return {
        async all(): Promise<readonly Club[]> {
            return fetchClubs(db);
        },
        async profile(clubKey: string): Promise<ClubProfile | null> {
            return fetchClubProfile(db, clubKey);
        },
    };
}
