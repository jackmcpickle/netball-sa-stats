/**
 * Fetches fixture rows from `games` and hands them to the domain layer as
 * `GameFact`s. Both team columns are joined twice through aliases, because a
 * single join cannot resolve home and away at once.
 *
 * Teams are resolved season-wide by their own `grade`, never by the club's
 * grade: junior grading rounds put a team in fixtures outside its final
 * grade, and joining team→grade would misattribute roughly 8% of games (see
 * `docs/playhq-api.md` §6).
 */
import {
    and,
    asc,
    count,
    eq,
    inArray,
    ne,
    or,
    type SQL,
    sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from '@/db';
import { clubs, games, grades, seasons, teams } from '@/db/schema';
import type { OpponentCount } from '@/server/domain/head-to-head';
import type { GameFact } from '@/server/dto/head-to-head.dto';

const homeTeams = alias(teams, 'home_teams');
const awayTeams = alias(teams, 'away_teams');
const homeClubs = alias(clubs, 'home_clubs');
const awayClubs = alias(clubs, 'away_clubs');

const FACT_COLUMNS = {
    year: seasons.startYear,
    tier: grades.tier,
    gradeName: grades.name,
    round: games.round,
    roundName: games.roundName,
    isFinals: games.isFinals,
    playedAt: games.playedAt,
    homeClubKey: homeClubs.clubKey,
    awayClubKey: awayClubs.clubKey,
    homeTeamName: homeTeams.displayName,
    awayTeamName: awayTeams.displayName,
    homeScore: games.homeScore,
    awayScore: games.awayScore,
    status: games.status,
};

/**
 * Both sides are left joins, not inner: a bye has one null side and a
 * scheduled final can carry an undecided `ProvisionalTeam`. Inner joins would
 * silently drop both, and the fixture list would show a grade's rounds with
 * holes in them.
 *
 * Ordered by `(round, id)` in SQL. The `games.id` tiebreaker matters: many
 * games share a round number, and without it SQLite may return a different
 * order per call.
 */
async function fetchFacts(
    db: Db,
    where: SQL | undefined,
): Promise<readonly GameFact[]> {
    const rows = await db
        .select(FACT_COLUMNS)
        .from(games)
        .innerJoin(grades, eq(grades.id, games.gradeId))
        .innerJoin(seasons, eq(seasons.id, grades.seasonId))
        .leftJoin(homeTeams, eq(homeTeams.id, games.homeTeamId))
        .leftJoin(awayTeams, eq(awayTeams.id, games.awayTeamId))
        .leftJoin(homeClubs, eq(homeClubs.id, homeTeams.clubId))
        .leftJoin(awayClubs, eq(awayClubs.id, awayTeams.clubId))
        .where(where)
        .orderBy(asc(games.round), asc(games.id));

    return rows.map(
        (row): GameFact => ({
            year: row.year,
            tier: row.tier,
            gradeName: row.gradeName,
            round: row.round,
            roundName: row.roundName,
            isFinals: row.isFinals,
            playedAt: row.playedAt,
            homeClubKey: row.homeClubKey,
            awayClubKey: row.awayClubKey,
            homeTeamName: row.homeTeamName,
            awayTeamName: row.awayTeamName,
            homeScore: row.homeScore,
            awayScore: row.awayScore,
            status: row.status,
        }),
    );
}

/**
 * Every meeting between two clubs, across every season and grade. The pair
 * filter is an `or` of two `and`s because either club can be the home side.
 */
export async function fetchGameFactsForPair(
    db: Db,
    clubA: string,
    clubB: string,
): Promise<readonly GameFact[]> {
    if (clubA === clubB) {
        return [];
    }
    return fetchFacts(
        db,
        or(
            and(eq(homeClubs.clubKey, clubA), eq(awayClubs.clubKey, clubB)),
            and(eq(homeClubs.clubKey, clubB), eq(awayClubs.clubKey, clubA)),
        ),
    );
}

/** Every fixture in one grade, ordered so finals fall after the last round. */
export async function fetchGameFactsForGrade(
    db: Db,
    gradeKey: string,
): Promise<readonly GameFact[]> {
    return fetchFacts(db, eq(grades.gradeKey, gradeKey));
}

/**
 * How many games a club has played against each other club, all seasons. Byes
 * and provisional sides drop out via the `ne`/null-safe pair conditions —
 * `topOpponents` should never offer a link to a fixture that has no opponent.
 */
export async function fetchOpponentCounts(
    db: Db,
    clubKey: string,
): Promise<readonly OpponentCount[]> {
    const opponent = sql<string>`
        case when ${homeClubs.clubKey} = ${clubKey}
            then ${awayClubs.clubKey} else ${homeClubs.clubKey} end
    `;
    const opponentName = sql<string>`
        case when ${homeClubs.clubKey} = ${clubKey}
            then ${awayClubs.name} else ${homeClubs.name} end
    `;

    const rows = await db
        .select({
            clubKey: opponent,
            name: opponentName,
            played: count(),
        })
        .from(games)
        .innerJoin(homeTeams, eq(homeTeams.id, games.homeTeamId))
        .innerJoin(awayTeams, eq(awayTeams.id, games.awayTeamId))
        .innerJoin(homeClubs, eq(homeClubs.id, homeTeams.clubId))
        .innerJoin(awayClubs, eq(awayClubs.id, awayTeams.clubId))
        .where(
            and(
                or(
                    eq(homeClubs.clubKey, clubKey),
                    eq(awayClubs.clubKey, clubKey),
                ),
                ne(homeClubs.clubKey, awayClubs.clubKey),
                inArray(games.status, ['final', 'forfeit']),
            ),
        )
        .groupBy(opponent, opponentName);

    return rows.map((row) => ({
        clubKey: row.clubKey,
        name: row.name,
        played: row.played,
    }));
}

export function createGamesRepo(db: Db): {
    factsForPair(clubA: string, clubB: string): Promise<readonly GameFact[]>;
    factsForGrade(gradeKey: string): Promise<readonly GameFact[]>;
    opponentCounts(clubKey: string): Promise<readonly OpponentCount[]>;
} {
    return {
        async factsForPair(
            clubA: string,
            clubB: string,
        ): Promise<readonly GameFact[]> {
            return fetchGameFactsForPair(db, clubA, clubB);
        },
        async factsForGrade(gradeKey: string): Promise<readonly GameFact[]> {
            return fetchGameFactsForGrade(db, gradeKey);
        },
        async opponentCounts(
            clubKey: string,
        ): Promise<readonly OpponentCount[]> {
            return fetchOpponentCounts(db, clubKey);
        },
    };
}
