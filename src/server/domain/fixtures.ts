/**
 * The domain object for "one grade's fixture list". Pure: turns `GameFact`s
 * into display rows, and sorts them for the table.
 */
import { isNull } from 'es-toolkit';
import type { TableSpec } from '@/db/queries/pagination';
import type { GameStatus } from '@/db/schema';
import type { GameFact } from '@/server/dto/head-to-head.dto';
import type { ResultRow } from '@/server/dto/results.dto';

/**
 * The winning margin, or null where there is no honest one to show. A forfeit
 * is excluded on `status`, not on "both scores present": PlayHQ fabricates a
 * 0–20 scoreline on forfeit rows, and a 20-goal margin nobody played would
 * top any margin sort.
 */
export function marginFor(game: {
    readonly homeScore: number | null;
    readonly awayScore: number | null;
    readonly status: GameStatus;
}): number | null {
    if (game.status !== 'final') {
        return null;
    }
    if (isNull(game.homeScore) || isNull(game.awayScore)) {
        return null;
    }
    return Math.abs(game.homeScore - game.awayScore);
}

export function toResultRows(facts: readonly GameFact[]): readonly ResultRow[] {
    return facts.map((fact): ResultRow => {
        const { homeClubKey: home, awayClubKey: away } = fact;
        return {
            awayClubKey: away,
            awayScore: fact.awayScore,
            awayTeamName: fact.awayTeamName,
            canCompare: !isNull(home) && !isNull(away) && home !== away,
            homeClubKey: home,
            homeScore: fact.homeScore,
            homeTeamName: fact.homeTeamName,
            isFinals: fact.isFinals,
            margin: marginFor(fact),
            playedAt: fact.playedAt,
            round: fact.round,
            roundName: fact.roundName,
            status: fact.status,
        };
    });
}

/**
 * The allow-list the fixture table sorts by. Ordering itself happens in SQL
 * (`orderFor` in `games.repo.ts`) — including the nulls-last rule and the
 * `(round, home, away)` tiebreaker that keeps paging stable — because a grade
 * holds hundreds of fixtures and only one page of them is ever shown.
 */
export const FIXTURES_TABLE_SPEC: TableSpec = {
    defaultDesc: false,
    defaultSort: 'round',
    sortable: ['round', 'playedAt', 'home', 'away', 'margin'],
};
