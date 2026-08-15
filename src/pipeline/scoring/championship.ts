/**
 * The championship formula, and nothing else.
 *
 * Pure functions over plain rows: no database, no Drizzle, no DTO types.
 * The Worker joins `team_season_results` to `grade_weights` at query time and
 * feeds the result in here, so re-weighting a grade in D1 re-ranks every season
 * with no re-import. There is exactly one implementation of the formula and it
 * lives in this file — never in SQL.
 */

/** One team's finish in one grade, with the weight resolved at query time. */
export type ScoringRow = {
    readonly clubKey: string;
    readonly year: number;
    /** 1 is best. */
    readonly ladderPosition: number;
    /** Ladder size. Position 4 of 6 is not position 4 of 14. */
    readonly teamCount: number;
    /** From `grade_weights`, joined on (competition, tier, division). */
    readonly weight: number;
    /**
     * Archive rows whose placing came from finals rather than the ladder. They
     * still score — the placing is the best record there is — but they cannot
     * evidence a minor premiership.
     */
    readonly positionUncertain: boolean;
    readonly won: number | null;
    readonly lost: number | null;
    readonly drawn: number | null;
};

export type ClubSeasonTotals = {
    readonly clubKey: string;
    readonly rank: number;
    readonly points: number;
    readonly teams: number;
    /** Null when not one of the club's rows reported a win/loss/draw count. */
    readonly winPercentage: number | null;
    /** Games with a recorded outcome, so a null-heavy season reads as 0. */
    readonly gamesPlayed: number;
    readonly minorPremierships: number;
};

/**
 * A single team's contribution. Last of the grade still earns one unit, so
 * fielding a team is worth more than not fielding one, and a wide grade is
 * worth more than a narrow one at the same finish.
 */
export function teamPoints(row: ScoringRow): number {
    const placing = row.teamCount - row.ladderPosition + 1;
    return Math.max(0, placing) * row.weight;
}

function roundPoints(value: number): number {
    return Math.round(value * 10) / 10;
}

type Accumulator = {
    points: number;
    teams: number;
    won: number;
    games: number;
    /** False until a row actually reports win/loss/draw counts. */
    hasRecord: boolean;
    minorPremierships: number;
};

function emptyAccumulator(): Accumulator {
    return {
        points: 0,
        teams: 0,
        won: 0,
        games: 0,
        hasRecord: false,
        minorPremierships: 0,
    };
}

function accumulate(totals: Map<string, Accumulator>, row: ScoringRow): void {
    const current = totals.get(row.clubKey) ?? emptyAccumulator();
    current.points += teamPoints(row);
    current.teams += 1;
    if (row.won !== null || row.lost !== null || row.drawn !== null) {
        current.hasRecord = true;
        current.won += row.won ?? 0;
        current.games += (row.won ?? 0) + (row.lost ?? 0) + (row.drawn ?? 0);
    }
    if (row.ladderPosition === 1 && !row.positionUncertain) {
        current.minorPremierships += 1;
    }
    totals.set(row.clubKey, current);
}

/**
 * Win rate as a percentage to one decimal, or null when the inputs are absent.
 * A club whose every row lacks counts must not read as 0% — that is a claim
 * about the club rather than about the data.
 */
export function winRate(
    won: number,
    games: number,
    hasRecord: boolean,
): number | null {
    if (!hasRecord || games === 0) {
        return null;
    }
    return Math.round((won / games) * 1000) / 10;
}

/**
 * Rank the clubs in one season. Callers pass only rows they want counted —
 * excluding in-progress seasons is the caller's job, because the same maths
 * ranks a finished season and previews an unfinished one.
 *
 * Clubs level on points share a rank, and the next rank skips accordingly.
 */
export function rankClubs(
    rows: readonly ScoringRow[],
): readonly ClubSeasonTotals[] {
    const totals = new Map<string, Accumulator>();
    for (const row of rows) {
        accumulate(totals, row);
    }

    const ordered = [...totals.entries()]
        .map(([clubKey, accumulator]) => ({
            clubKey,
            points: roundPoints(accumulator.points),
            teams: accumulator.teams,
            winPercentage: winRate(
                accumulator.won,
                accumulator.games,
                accumulator.hasRecord,
            ),
            gamesPlayed: accumulator.games,
            minorPremierships: accumulator.minorPremierships,
        }))
        .toSorted(
            (a, b) =>
                b.points - a.points ||
                b.minorPremierships - a.minorPremierships ||
                a.clubKey.localeCompare(b.clubKey),
        );

    let rank = 0;
    let previousPoints: number | null = null;
    return ordered.map((entry, index) => {
        if (previousPoints === null || entry.points !== previousPoints) {
            rank = index + 1;
            previousPoints = entry.points;
        }
        return { ...entry, rank };
    });
}

export type RankedSeason = {
    readonly year: number;
    readonly totals: readonly ClubSeasonTotals[];
};

/**
 * Rank a run of seasons in year order. Nothing here knows which years are
 * final; the caller filters. Movement is derived by the reader from the
 * previous ranked season, and a club absent from it simply has no earlier rank.
 */
export function rankSeasons(
    rows: readonly ScoringRow[],
): readonly RankedSeason[] {
    const byYear = new Map<number, ScoringRow[]>();
    for (const row of rows) {
        const bucket = byYear.get(row.year);
        if (bucket) {
            bucket.push(row);
        } else {
            byYear.set(row.year, [row]);
        }
    }
    return [...byYear.keys()]
        .toSorted((a, b) => a - b)
        .map((year) => ({
            year,
            totals: rankClubs(byYear.get(year) ?? []),
        }));
}

/**
 * Previous-season rank per club, for the movement arrows. Null for a club that
 * did not appear last season — and for every club in the first covered season,
 * where there is nothing to compare to.
 */
export function previousRanks(
    season: RankedSeason | undefined,
): ReadonlyMap<string, number> {
    return new Map(
        (season?.totals ?? []).map((entry) => [entry.clubKey, entry.rank]),
    );
}
