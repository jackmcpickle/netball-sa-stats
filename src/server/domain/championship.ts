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
    return [...rows].sort((a, b) => {
        const primary =
            sort === 'club'
                ? a.club.name.localeCompare(b.club.name)
                : sort === 'points'
                  ? a.points - b.points
                  : sort === 'teams'
                    ? a.teams - b.teams
                    : a.rank - b.rank;
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
                kind: 'not-found',
                entity: 'season',
                key: String(year),
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

    public sorted(q: TableQuery): {
        readonly rows: readonly ChampionshipRow[];
        readonly totalRows: number;
        readonly state: TableState;
    } {
        return q.apply(this.rowsData, sortChampionshipRows);
    }
}
