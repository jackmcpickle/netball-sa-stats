import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { LaddersPage } from '@/components/ladders/ladders-page';
import { getDb } from '@/db';
import { parseOptionalIntParam } from '@/routes/-search-params';
import { tableSearchDeps, tableSearchSchema } from '@/routes/-table-params';
import { pageHead } from '@/seo/head';
import { breadcrumbSchema } from '@/seo/structured-data';
import { createServices, resolvePageResult } from '@/server/container';

export type { LaddersPageDto as LaddersData } from '@/server/dto/ladders.dto';

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
    .handler(async ({ data }) =>
        resolvePageResult(await createServices(getDb()).ladders.getPage(data)),
    );

const DESCRIPTION =
    'Full grade ladders for South Australian netball — position, played, won, lost, goals and percentage for every team in every covered grade and season.';

export const Route = createFileRoute('/ladders')({
    head: () =>
        pageHead({
            title: 'Ladders',
            description: DESCRIPTION,
            path: '/ladders',
            schema: [
                breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Ladders', path: '/ladders' },
                ]),
            ],
        }),
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({
        year: search.year,
        grade: search.grade,
        ...tableSearchDeps(search),
    }),
    loader: async ({ deps }) => await loadLadders({ data: deps }),
    component: LaddersPage,
});
