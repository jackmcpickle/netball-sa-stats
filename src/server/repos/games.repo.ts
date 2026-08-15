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
import { and, asc, count, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { isUndefined } from 'es-toolkit';
import type { Db } from '@/db';
import { clubs, games, grades, seasons, teams } from '@/db/schema';
import type { OpponentCount } from '@/server/domain/head-to-head';
import type { PageRequest } from '@/server/domain/table-query';
import type { GameFact } from '@/server/dto/head-to-head.dto';

const homeTeams = alias(teams, 'home_teams');
const awayTeams = alias(teams, 'away_teams');
const homeClubs = alias(clubs, 'home_clubs');
const awayClubs = alias(clubs, 'away_clubs');

const FACT_COLUMNS = {
    awayClubKey: awayClubs.clubKey,
    awayScore: games.awayScore,
    awayTeamName: awayTeams.displayName,
    gradeName: grades.name,
    homeClubKey: homeClubs.clubKey,
    homeScore: games.homeScore,
    homeTeamName: homeTeams.displayName,
    isFinals: games.isFinals,
    playedAt: games.playedAt,
    round: games.round,
    roundName: games.roundName,
    status: games.status,
    tier: grades.tier,
    year: seasons.startYear,
};

/**
 * The winning margin, in SQL, so the fixture table can sort on it without
 * reading every row. Mirrors `marginFor` in `domain/fixtures.ts` exactly,
 * including the forfeit rule: PlayHQ writes a nominal 0–20 on a forfeit, and
 * a 20-goal margin nobody played would otherwise top a biggest-wins sort.
 */
const MARGIN = sql<number | null>`
    case when ${games.status} = 'final'
        and ${games.homeScore} is not null
        and ${games.awayScore} is not null
    then abs(${games.homeScore} - ${games.awayScore}) end
`;

const ORDER_COLUMNS = new Map<string, SQL | SQLiteColumn>([
    ['round', games.round],
    ['playedAt', games.playedAt],
    ['home', homeTeams.displayName],
    ['away', awayTeams.displayName],
    ['margin', MARGIN],
]);

/**
 * SQLite sorts nulls FIRST, in both directions. Left alone, an ascending
 * margin sort would open with every bye and unplayed final rather than with
 * the closest game, so each ordering leads with an explicit `is null` key.
 *
 * The trailing `(round, home, away)` tiebreaker is what keeps paging stable:
 * many fixtures share a round, and without it SQLite may order them
 * differently per query, so a row appears on two pages or on none.
 */
function orderFor(request: PageRequest): (SQL | SQLiteColumn)[] {
    const column = ORDER_COLUMNS.get(request.sort) ?? games.round;
    return [
        sql`${column} is null`,
        request.desc ? desc(column) : asc(column),
        sql`${games.round} is null`,
        asc(games.round),
        asc(homeTeams.displayName),
        asc(awayTeams.displayName),
    ];
}

/**
 * Both sides are left joins, not inner: a bye has one null side and a
 * scheduled final can carry an undecided `ProvisionalTeam`. Inner joins would
 * silently drop both, and the fixture list would show a grade's rounds with
 * holes in them.
 *
 * With no `request`, every matching row comes back ordered by `(round, id)`
 * — the shape the head-to-head aggregate needs, since a record computed over
 * one page would be wrong. With a `request`, SQL does the ordering and
 * slicing instead.
 */
async function fetchFacts(
    db: Db,
    where: SQL | undefined,
    request?: PageRequest,
): Promise<readonly GameFact[]> {
    const ordered = db
        .select(FACT_COLUMNS)
        .from(games)
        .innerJoin(grades, eq(grades.id, games.gradeId))
        .innerJoin(seasons, eq(seasons.id, grades.seasonId))
        .leftJoin(homeTeams, eq(homeTeams.id, games.homeTeamId))
        .leftJoin(awayTeams, eq(awayTeams.id, games.awayTeamId))
        .leftJoin(homeClubs, eq(homeClubs.id, homeTeams.clubId))
        .leftJoin(awayClubs, eq(awayClubs.id, awayTeams.clubId))
        .where(where)
        .orderBy(
            ...(isUndefined(request)
                ? [asc(games.round), asc(games.id)]
                : orderFor(request)),
        );

    const rows = isUndefined(request)
        ? await ordered
        : await ordered.limit(request.limit).offset(request.offset);

    return rows.map(
        (row): GameFact => ({
            awayClubKey: row.awayClubKey,
            awayScore: row.awayScore,
            awayTeamName: row.awayTeamName,
            gradeName: row.gradeName,
            homeClubKey: row.homeClubKey,
            homeScore: row.homeScore,
            homeTeamName: row.homeTeamName,
            isFinals: row.isFinals,
            playedAt: row.playedAt,
            round: row.round,
            roundName: row.roundName,
            status: row.status,
            tier: row.tier,
            year: row.year,
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
    return await fetchFacts(
        db,
        or(
            and(eq(homeClubs.clubKey, clubA), eq(awayClubs.clubKey, clubB)),
            and(eq(homeClubs.clubKey, clubB), eq(awayClubs.clubKey, clubA)),
        ),
    );
}

export async function countGamesForGrade(
    db: Db,
    gradeKey: string,
): Promise<number> {
    const [row] = await db
        .select({ total: count() })
        .from(games)
        .innerJoin(grades, eq(grades.id, games.gradeId))
        .where(eq(grades.gradeKey, gradeKey));
    return row?.total ?? 0;
}

/** One page of a grade's fixtures, sorted and sliced in SQL. */
export async function fetchGamePageForGrade(
    db: Db,
    gradeKey: string,
    request: PageRequest,
): Promise<readonly GameFact[]> {
    return await fetchFacts(db, eq(grades.gradeKey, gradeKey), request);
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

export interface GamesRepo {
    readonly factsForPair: (
        clubA: string,
        clubB: string,
    ) => Promise<readonly GameFact[]>;
    readonly countForGrade: (gradeKey: string) => Promise<number>;
    readonly pageForGrade: (
        gradeKey: string,
        request: PageRequest,
    ) => Promise<readonly GameFact[]>;
    readonly opponentCounts: (
        clubKey: string,
    ) => Promise<readonly OpponentCount[]>;
}

export function createGamesRepo(db: Db): GamesRepo {
    return {
        async countForGrade(gradeKey: string): Promise<number> {
            return await countGamesForGrade(db, gradeKey);
        },
        async factsForPair(
            clubA: string,
            clubB: string,
        ): Promise<readonly GameFact[]> {
            return await fetchGameFactsForPair(db, clubA, clubB);
        },
        async opponentCounts(
            clubKey: string,
        ): Promise<readonly OpponentCount[]> {
            return await fetchOpponentCounts(db, clubKey);
        },
        async pageForGrade(
            gradeKey: string,
            request: PageRequest,
        ): Promise<readonly GameFact[]> {
            return await fetchGamePageForGrade(db, gradeKey, request);
        },
    };
}
