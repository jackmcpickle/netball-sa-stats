import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { LaddersPage } from '@/components/ladders/ladders-page';
import { getDb } from '@/db';
import { parseOptionalIntParam } from '@/routes/-search-params';
import { tableSearchDeps, tableSearchSchema } from '@/routes/-table-params';
import { loadLaddersData } from '@/server/loaders/ladders';

export type { LaddersData } from '@/server/loaders/ladders';

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
    .handler(async ({ data }) => loadLaddersData(getDb(), data));

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
