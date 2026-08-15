import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { HeadToHeadPage } from '@/components/head-to-head/head-to-head-page';
import { getDb } from '@/db';
import {
    parseOptionalBoolParam,
    parseOptionalIntParam,
} from '@/routes/-search-params';
import { tableSearchDeps, tableSearchSchema } from '@/routes/-table-params';
import { pageHead } from '@/seo/head';
import { breadcrumbSchema } from '@/seo/structured-data';
import { createServices, resolvePageResult } from '@/server/container';

export type {
    HeadToHeadPageDto as HeadToHeadData,
    Meeting,
} from '@/server/dto/head-to-head.dto';

/**
 * `band` is a tier number or the literal `'all'`. Anything else — including a
 * tier the pair never met in — is dropped here or in the service, so a stale
 * shared link renders the all-grades view rather than a 500.
 */
const bandSchema = z.preprocess(
    (value) => (value === 'all' ? 'all' : parseOptionalIntParam(value)),
    z.union([z.literal('all'), z.number().int()]).optional(),
);

const searchSchema = tableSearchSchema.extend({
    a: z.string().optional(),
    b: z.string().optional(),
    band: bandSchema,
    includePast: z.preprocess(parseOptionalBoolParam, z.boolean().optional()),
});

const loadHeadToHead = createServerFn({ method: 'GET' })
    .validator(
        z.object({
            a: z.string().optional(),
            b: z.string().optional(),
            band: z.union([z.literal('all'), z.number().int()]).optional(),
            includePast: z.boolean().optional(),
            sort: z.string().optional(),
            dir: z.enum(['asc', 'desc']).optional(),
            page: z.number().int().optional(),
            pageSize: z.number().int().optional(),
        }),
    )
    .handler(async ({ data }) =>
        resolvePageResult(
            await createServices(getDb()).headToHead.getPage(data),
        ),
    );

const PATH = '/head-to-head';

const DESCRIPTION =
    'Head-to-head records between South Australian netball clubs: every meeting since 2025, by grade band, with wins, losses and margins for both sides.';

export const Route = createFileRoute('/head-to-head')({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({
        a: search.a,
        b: search.b,
        band: search.band,
        includePast: search.includePast,
        ...tableSearchDeps(search),
    }),
    loader: async ({ deps }) => await loadHeadToHead({ data: deps }),
    head: () =>
        pageHead({
            title: 'Head to head',
            description: DESCRIPTION,
            path: PATH,
            schema: [
                breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Head to head', path: PATH },
                ]),
            ],
        }),
    component: HeadToHeadPage,
});
