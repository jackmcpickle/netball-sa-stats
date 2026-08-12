/**
 * The domain object for "one grade's fixture list". Pure: turns `GameFact`s
 * into display rows, and sorts them for the table.
 */
import type { TableSpec } from '@/db/queries/pagination';
import type { GameStatus } from '@/db/schema';
import type { TableQuery } from '@/server/domain/table-query';
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
    if (game.homeScore === null || game.awayScore === null) {
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
            canCompare: home !== null && away !== null && home !== away,
        };
    });
}

export const FIXTURES_TABLE_SPEC: TableSpec = {
    sortable: ['round', 'playedAt', 'home', 'away', 'margin'],
    defaultSort: 'round',
    defaultDesc: false,
};

type FixtureComparator = (left: ResultRow, right: ResultRow) => number;

/**
 * Absent values sort last whichever way the column is pointed. Treating null
 * as zero would float every bye and unplayed final to the top of an ascending
 * margin sort, ahead of real one-goal games.
 */
function nullsLast(
    pick: (row: ResultRow) => number | null,
    desc: boolean,
): FixtureComparator {
    return (left, right) => {
        const a = pick(left);
        const b = pick(right);
        if (a === null || b === null) {
            if (a === b) {
                return 0;
            }
            // Pre-multiplied by the direction the caller will apply, so the
            // nulls stay at the bottom after the flip.
            return (a === null ? 1 : -1) * (desc ? -1 : 1);
        }
        return a - b;
    };
}

function text(pick: (row: ResultRow) => string | null): FixtureComparator {
    return (left, right) => (pick(left) ?? '').localeCompare(pick(right) ?? '');
}

function comparatorFor(sort: string, desc: boolean): FixtureComparator {
    switch (sort) {
        case 'playedAt':
            return nullsLast((row) => row.playedAt, desc);
        case 'margin':
            return nullsLast((row) => row.margin, desc);
        case 'home':
            return text((row) => row.homeTeamName);
        case 'away':
            return text((row) => row.awayTeamName);
        default:
            return nullsLast((row) => row.round, desc);
    }
}

/**
 * Every sort ties back to (round asc, home team, away team). Without that
 * tiebreaker, rows level on the sorted column can swap between requests and
 * the same fixture appears on two pages — or on none.
 */
function tiebreak(left: ResultRow, right: ResultRow): number {
    if (left.round !== right.round) {
        return (left.round ?? 0) - (right.round ?? 0);
    }
    const home = (left.homeTeamName ?? '').localeCompare(
        right.homeTeamName ?? '',
    );
    return home === 0
        ? (left.awayTeamName ?? '').localeCompare(right.awayTeamName ?? '')
        : home;
}

export function sortFixtures(
    rows: readonly ResultRow[],
    q: TableQuery,
): readonly ResultRow[] {
    const { sort, desc } = q.state;
    const compare = comparatorFor(sort, desc);
    const direction = desc ? -1 : 1;
    return [...rows].sort((left, right) => {
        const primary = compare(left, right);
        return primary === 0 ? tiebreak(left, right) : primary * direction;
    });
}
