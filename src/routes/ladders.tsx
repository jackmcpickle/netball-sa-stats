import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { LaddersPage } from '@/components/ladders/ladders-page';
import { getCoverage, getLadderFor, listGrades } from '@/data';
import type { GradeSummary, Ladder } from '@/data/types';
import { parseOptionalIntParam } from '@/routes/-search-params';

export interface LaddersData {
    readonly years: readonly number[];
    readonly year: number;
    readonly grades: readonly GradeSummary[];
    readonly ladder: Ladder | null;
}

const searchSchema = z.object({
    year: z.preprocess(parseOptionalIntParam, z.number().int().optional()),
    grade: z.string().optional(),
});

const loadLadders = createServerFn({ method: 'GET' })
    .validator(
        z.object({
            year: z.number().int().optional(),
            grade: z.string().optional(),
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
                gradeKey === undefined ? null : await getLadderFor(gradeKey),
        };
    });

export const Route = createFileRoute('/ladders')({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({ year: search.year, grade: search.grade }),
    loader: async ({ deps }) =>
        loadLadders({ data: { year: deps.year, grade: deps.grade } }),
    component: LaddersPage,
});
