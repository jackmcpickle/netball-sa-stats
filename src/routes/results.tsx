import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ResultsPage } from '@/components/results/results-page';
import { getDb } from '@/db';
import { parseOptionalIntParam } from '@/routes/-search-params';
import { tableSearchDeps, tableSearchSchema } from '@/routes/-table-params';
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
    .handler(async ({ data }) => {
        return resolvePageResult(
            await createServices(getDb()).results.getPage(data),
        );
    });

export const Route = createFileRoute('/results')({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({
        year: search.year,
        grade: search.grade,
        ...tableSearchDeps(search),
    }),
    loader: async ({ deps }) => loadResults({ data: deps }),
    component: ResultsPage,
});
