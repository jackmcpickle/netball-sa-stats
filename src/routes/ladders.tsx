import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { LaddersPage } from '@/components/ladders/ladders-page';
import { getCoverage, getLadderFor, listGrades } from '@/data';
import type { GradeSummary, Ladder } from '@/data/types';
import type { TableState } from '@/db/queries/pagination';
import { parseOptionalIntParam } from '@/routes/-search-params';
import { tableSearchDeps, tableSearchSchema } from '@/routes/-table-params';

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

const searchSchema = tableSearchSchema.extend({
    year: z.preprocess(parseOptionalIntParam, z.number().int().optional()),
    grade: z.string().optional(),
});

const loadLadders = createServerFn({ method: 'GET' })
    .validator(
        z.object({
            year: z.number().int().optional(),
            grade: z.string().optional(),
            sort: z.string().optional(),
            dir: z.enum(['asc', 'desc']).optional(),
            page: z.number().int().optional(),
            pageSize: z.number().int().optional(),
        }),
    )
    .handler(async ({ data }): Promise<LaddersData> => {
        const coverage = await getCoverage();
        const year =
            data.year !== undefined && coverage.years.includes(data.year)
                ? data.year
                : (coverage.years.at(-1) ?? coverage.rankedYears[0]);
        const grades = await listGrades(year);
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
                    : await getLadderFor(gradeKey, {
                          sort: data.sort,
                          dir: data.dir,
                          page: data.page,
                          pageSize: data.pageSize,
                      }),
        };
    });

export const Route = createFileRoute('/ladders')({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({
        year: search.year,
        grade: search.grade,
        ...tableSearchDeps(search),
    }),
    loader: async ({ deps }) => loadLadders({ data: deps }),
    component: LaddersPage,
});
