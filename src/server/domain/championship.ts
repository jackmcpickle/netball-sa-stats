/**
 * The domain object for "one season's ranked championship table".
 * `sortChampionshipRows` used to live as a free function in
 * `src/db/queries/championship.ts`, and the `previousYear` lookup used to
 * live inline in `src/server/loaders/rankings.ts`; both now live here, and
 * their old homes delegate to this class.
 */
import type { TableState } from '@/db/queries/pagination';
import type { DomainError, Result } from '@/server/domain/result';
import { err, ok } from '@/server/domain/result';
import type { TableQuery } from '@/server/domain/table-query';
import type {
    ChampionshipRow,
    ChampionshipSeason,
} from '@/server/dto/rankings.dto';

/** The per-column comparison, before the tiebreaker and direction apply. */
function primaryFor(
    sort: string,
    a: ChampionshipRow,
    b: ChampionshipRow,
): number {
    switch (sort) {
        case 'club': {
            return a.club.name.localeCompare(b.club.name);
        }
        case 'points': {
            return a.points - b.points;
        }
        case 'teams': {
            return a.teams - b.teams;
        }
        default: {
            return a.rank - b.rank;
        }
    }
}

/**
 * Every sort gets `rank` as a tiebreaker. Without one, rows with equal points
 * can swap between requests and the same club appears on two pages — or on
 * none.
 */
function sortChampionshipRows(
    rows: readonly ChampionshipRow[],
    q: TableQuery,
): readonly ChampionshipRow[] {
    const { sort, desc } = q.state;
    const direction = desc ? -1 : 1;
    return rows.toSorted((a, b) => {
        const primary = primaryFor(sort, a, b);
        return primary === 0 ? a.rank - b.rank : primary * direction;
    });
}

export class Championship {
    private readonly year: number;
    private readonly rowsData: readonly ChampionshipRow[];

    private constructor(year: number, rows: readonly ChampionshipRow[]) {
        this.year = year;
        this.rowsData = rows;
    }

    public static fromHistory(
        history: readonly ChampionshipSeason[],
        year: number,
    ): Result<Championship, DomainError> {
        const season = history.find((entry) => entry.year === year);
        if (!season) {
            return err({
                entity: 'season',
                key: String(year),
                kind: 'not-found',
            });
        }
        return ok(new Championship(season.year, season.rows));
    }

    /**
     * The ranked year immediately before this one, or `null` when this is
     * the earliest ranked year (or there is no earlier ranked year at all).
     */
    public previousYear(rankedYears: readonly number[]): number | null {
        const index = rankedYears.indexOf(this.year);
        return index > 0 ? (rankedYears[index - 1] ?? null) : null;
    }

    /**
     * Rank 1 on the unsorted season. Table sort and page must not change
     * this: Home FAQ names the championship leader, not the first visible
     * row.
     */
    public leader(): ChampionshipRow | null {
        return this.rowsData.find((row) => row.rank === 1) ?? null;
    }

    /**
     * The one table still sorted and sliced in memory, and the only one that
     * cannot move to SQL without a schema change.
     *
     * A championship row's rank is not stored anywhere: it is computed by
     * `rankSeasons` over every final season, with each grade's weight
     * resolved at query time from `grade_weights`. That is deliberate — see
     * `db/queries/results.ts` — because it means editing a weight re-ranks
     * every season with no re-import. Paging in SQL would mean materialising
     * ranks into a table maintained by the importer, which trades that
     * property away.
     *
     * The cost of leaving it is nil: a season holds at most 32 clubs, so it
     * never fills even one page, and the full history is already fetched for
     * rank movement and the worst-rank axis. Revisit only if the
     * query-time-weights rule is ever dropped.
     */
    public sorted(q: TableQuery): {
        readonly rows: readonly ChampionshipRow[];
        readonly totalRows: number;
        readonly state: TableState;
    } {
        return q.apply(this.rowsData, sortChampionshipRows);
    }
}
