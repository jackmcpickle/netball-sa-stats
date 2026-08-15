import { isNull } from 'es-toolkit';
/**
 * The domain object for "one grade's fixture list". Pure: turns `GameFact`s
 * into display rows, and sorts them for the table.
 */
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
            round: fact.round,
            roundName: fact.roundName,
            isFinals: fact.isFinals,
            playedAt: fact.playedAt,
            homeTeamName: fact.homeTeamName,
            awayTeamName: fact.awayTeamName,
            homeClubKey: home,
            awayClubKey: away,
            homeScore: fact.homeScore,
            awayScore: fact.awayScore,
            margin: marginFor(fact),
            status: fact.status,
            canCompare: !isNull(home) && !isNull(away) && home !== away,
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
    sortable: ['round', 'playedAt', 'home', 'away', 'margin'],
    defaultSort: 'round',
    defaultDesc: false,
};
