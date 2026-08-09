import { getLadderFor, listGrades } from '@/data';
import type { GradeSummary, Ladder } from '@/data/types';
import type { Db } from '@/db';
import { fetchSeasons } from '@/db/queries/coverage';
import type { TableState } from '@/db/queries/pagination';
import { Coverage } from '@/server/domain/coverage';

export interface LaddersData {
    readonly years: readonly number[];
    /** Null only for a genuinely empty dataset — see `Coverage.resolveYear`. */
    readonly year: number | null;
    readonly grades: readonly GradeSummary[];
    readonly ladder:
        | (Ladder & {
              readonly totalRows: number;
              readonly tableState: TableState;
          })
        | null;
}

export async function loadLaddersData(
    db: Db,
    data: {
        year?: number;
        grade?: string;
        sort?: string;
        dir?: 'asc' | 'desc';
        page?: number;
        pageSize?: number;
    },
): Promise<LaddersData> {
    const coverage = Coverage.from(await fetchSeasons(db));
    const year = coverage.resolveYear(data.year);
    if (year === undefined) {
        return {
            years: coverage.years(),
            year: null,
            grades: [],
            ladder: null,
        };
    }
    const grades = await listGrades(db, year);
    const gradeKey =
        data.grade !== undefined &&
        grades.some((grade) => grade.key === data.grade)
            ? data.grade
            : grades[0]?.key;
    return {
        years: coverage.years(),
        year,
        grades,
        ladder:
            gradeKey === undefined
                ? null
                : await getLadderFor(db, gradeKey, {
                      sort: data.sort,
                      dir: data.dir,
                      page: data.page,
                      pageSize: data.pageSize,
                  }),
    };
}
