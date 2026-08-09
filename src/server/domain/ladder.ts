/**
 * The domain object for "one grade's ladder". `sortLadderRows` used to live
 * as a free function in `src/db/queries/grades.ts`; that logic now lives
 * here, and the query module delegates to it.
 */
import type { TableState } from '@/db/queries/pagination';
import type { TableQuery } from '@/server/domain/table-query';
import type { LadderRow } from '@/server/dto/ladders.dto';
import type { GradeSummary } from '@/server/dto/shared.dto';

type LadderComparator = (a: LadderRow, b: LadderRow) => number;

function numeric(pick: (row: LadderRow) => number | null): LadderComparator {
    return (a, b) => (pick(a) ?? 0) - (pick(b) ?? 0);
}

const LADDER_COMPARATORS: Record<string, LadderComparator> = {
    team: (a, b) => a.displayName.localeCompare(b.displayName),
    played: numeric((row) => row.played),
    won: numeric((row) => row.won),
    lost: numeric((row) => row.lost),
    drawn: numeric((row) => row.drawn),
    goalsFor: numeric((row) => row.goalsFor),
    goalsAgainst: numeric((row) => row.goalsAgainst),
    percentage: numeric((row) => row.percentage),
    points: numeric((row) => row.points),
    position: (a, b) => a.position - b.position,
};

/**
 * Every sort gets ladder position as a tiebreaker. Without one, teams level on
 * the sorted column can swap between requests and the same team appears on
 * two pages — or on none.
 */
function sortLadderRows(
    rows: readonly LadderRow[],
    q: TableQuery,
): readonly LadderRow[] {
    const { sort, desc } = q.state;
    const direction = desc ? -1 : 1;
    const compare = LADDER_COMPARATORS[sort] ?? LADDER_COMPARATORS.position;
    return [...rows].sort((a, b) => {
        const primary = compare(a, b);
        return primary === 0 ? a.position - b.position : primary * direction;
    });
}

export class Ladder {
    private readonly gradeData: GradeSummary;
    private readonly rowsData: readonly LadderRow[];

    private constructor(grade: GradeSummary, rows: readonly LadderRow[]) {
        this.gradeData = grade;
        this.rowsData = rows;
    }

    public static from(
        grade: GradeSummary,
        rows: readonly LadderRow[],
    ): Ladder {
        return new Ladder(grade, rows);
    }

    public grade(): GradeSummary {
        return this.gradeData;
    }

    /** The pre-slice team count, always — never the size of a paged-down view. */
    public teamCount(): number {
        return this.rowsData.length;
    }

    public sorted(q: TableQuery): {
        readonly rows: readonly LadderRow[];
        readonly totalRows: number;
        readonly state: TableState;
    } {
        return q.apply(this.rowsData, sortLadderRows);
    }
}
