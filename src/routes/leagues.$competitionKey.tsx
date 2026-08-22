import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { isUndefined } from 'es-toolkit';
import { z } from 'zod';
import { LeaguePage } from '@/components/leagues/league-page';
import { getDb } from '@/db';
import { parseOptionalIntParam } from '@/routes/-search-params';
import { tableSearchSchema } from '@/routes/-table-params';
import { pageHead } from '@/seo/head';
import { breadcrumbSchema } from '@/seo/structured-data';
import { createServices, resolvePageResult } from '@/server/container';
import type { LeaguePageDto } from '@/server/dto/leagues.dto';

export type { LeaguePageDto as LeagueData } from '@/server/dto/leagues.dto';

const searchSchema = tableSearchSchema.extend({
    season: z.preprocess(parseOptionalIntParam, z.number().int().optional()),
});

const loadLeague = createServerFn({ method: 'GET' })
    .validator(
        z.object({
            competitionKey: z.string().min(1),
            season: z.number().int().optional(),
            sort: z.string().optional(),
            dir: z.enum(['asc', 'desc']).optional(),
            page: z.number().int().optional(),
            pageSize: z.number().int().optional(),
        }),
    )
    .handler(async ({ data }) =>
        resolvePageResult(await createServices(getDb()).leagues.getPage(data)),
    );

export const Route = createFileRoute('/leagues/$competitionKey')({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({
        season: search.season,
        sort: search.sort,
        dir: search.dir,
        page: search.page,
        pageSize: search.pageSize,
    }),
    loader: async ({ params, deps }) =>
        await loadLeague({
            data: { competitionKey: params.competitionKey, ...deps },
        }),
    head: ({
        loaderData,
        params,
    }: {
        loaderData?: LeaguePageDto;
        params: { competitionKey: string };
    }) => {
        const name = isUndefined(loaderData)
            ? params.competitionKey
            : loaderData.competition.name;
        return pageHead({
            title: name,
            description: `${name} clubs, ladders and — where weights exist — championship score. Other associations are not mixed in.`,
            path: `/leagues/${params.competitionKey}`,
            schema: [
                breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Leagues', path: '/leagues' },
                    {
                        name,
                        path: `/leagues/${params.competitionKey}`,
                    },
                ]),
            ],
        });
    },
    component: LeaguePage,
});
