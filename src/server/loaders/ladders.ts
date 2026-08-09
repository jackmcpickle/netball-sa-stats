import { getCoverage, getLadderFor, listGrades } from '@/data';
import type { GradeSummary, Ladder } from '@/data/types';
import type { Db } from '@/db';
import type { TableState } from '@/db/queries/pagination';

export interface LaddersData {
    readonly years: readonly number[];
    readonly year: number;
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
    const coverage = await getCoverage(db);
    const year =
        data.year !== undefined && coverage.years.includes(data.year)
            ? data.year
            : (coverage.years.at(-1) ?? coverage.rankedYears[0]);
    const grades = await listGrades(db, year);
    const gradeKey =
        data.grade !== undefined &&
        grades.some((grade) => grade.key === data.grade)
            ? data.grade
            : grades[0]?.key;
    return {
        years: coverage.years,
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
