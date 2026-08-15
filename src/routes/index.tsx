import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { RankingsPage } from '@/components/rankings/rankings-page';
import { getDb } from '@/db';
import { parseOptionalIntParam } from '@/routes/-search-params';
import { tableSearchSchema } from '@/routes/-table-params';
import { HOME_FAQ } from '@/seo/faq';
import { pageHead } from '@/seo/head';
import { SITE } from '@/seo/site';
import { datasetSchema, faqSchema } from '@/seo/structured-data';
import { createServices, resolvePageResult } from '@/server/container';

export type { RankingsPageDto as RankingsData } from '@/server/dto/rankings.dto';

const searchSchema = tableSearchSchema.extend({
    season: z.preprocess(parseOptionalIntParam, z.number().int().optional()),
});

/**
 * A server function rather than a plain loader body, so Task 6 can swap in
 * database queries without the route or any component changing shape.
 */
const loadRankings = createServerFn({ method: 'GET' })
    .validator(
        z.object({
            season: z.number().int().optional(),
            sort: z.string().optional(),
            dir: z.enum(['asc', 'desc']).optional(),
            page: z.number().int().optional(),
            pageSize: z.number().int().optional(),
        }),
    )
    .handler(async ({ data }) =>
        resolvePageResult(await createServices(getDb()).rankings.getPage(data)),
    );

const DESCRIPTION =
    'Club championship rankings for South Australian netball: every AMND, Premier League and Reserves ladder finish since 2000, weighted by grade and totalled into one score per club per season.';

export const Route = createFileRoute('/')({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({
        season: search.season,
        sort: search.sort,
        dir: search.dir,
        page: search.page,
        pageSize: search.pageSize,
    }),
    loader: async ({ deps }) => await loadRankings({ data: deps }),
    head: () =>
        pageHead({
            title: SITE.name,
            description: DESCRIPTION,
            path: '/',
            schema: [
                datasetSchema({
                    name: 'South Australian netball club championship',
                    description: DESCRIPTION,
                    path: '/',
                    temporalCoverage: '2000/..',
                }),
                faqSchema(HOME_FAQ),
            ],
        }),
    component: RankingsPage,
});
