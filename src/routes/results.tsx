import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ResultsPage } from '@/components/results/results-page';
import { getDb } from '@/db';
import { parseOptionalIntParam } from '@/routes/-search-params';
import { tableSearchDeps, tableSearchSchema } from '@/routes/-table-params';
import { pageHead } from '@/seo/head';
import { breadcrumbSchema } from '@/seo/structured-data';
import { createServices, resolvePageResult } from '@/server/container';

export type {
    ResultRow,
    ResultsPageDto as ResultsData,
} from '@/server/dto/results.dto';

const searchSchema = tableSearchSchema.extend({
    year: z.preprocess(parseOptionalIntParam, z.number().int().optional()),
    grade: z.string().optional(),
});

const loadResults = createServerFn({ method: 'GET' })
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
    .handler(async ({ data }) =>
        resolvePageResult(await createServices(getDb()).results.getPage(data)),
    );

const DESCRIPTION =
    'Fixture-by-fixture South Australian netball results from 2025 — round, date, both clubs, the score and the margin, filterable by season and grade.';

export const Route = createFileRoute('/results')({
    head: () =>
        pageHead({
            title: 'Results',
            description: DESCRIPTION,
            path: '/results',
            schema: [
                breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Results', path: '/results' },
                ]),
            ],
        }),
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({
        year: search.year,
        grade: search.grade,
        ...tableSearchDeps(search),
    }),
    loader: async ({ deps }) => await loadResults({ data: deps }),
    component: ResultsPage,
});
