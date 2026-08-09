import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { RankingsPage } from '@/components/rankings/rankings-page';
import { getDb } from '@/db';
import { parseOptionalIntParam } from '@/routes/-search-params';
import { tableSearchSchema } from '@/routes/-table-params';
import { createServices, describeDomainError } from '@/server/container';

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
    .handler(async ({ data }) => {
        const result = await createServices(getDb()).rankings.getPage(data);
        if (!result.ok) {
            if (result.error.kind === 'not-found') throw notFound();
            throw new Error(describeDomainError(result.error));
        }
        return result.value;
    });

export const Route = createFileRoute('/')({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({
        season: search.season,
        sort: search.sort,
        dir: search.dir,
        page: search.page,
        pageSize: search.pageSize,
    }),
    loader: async ({ deps }) => loadRankings({ data: deps }),
    component: RankingsPage,
});
