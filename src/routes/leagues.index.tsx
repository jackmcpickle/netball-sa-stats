import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { LeaguesIndexPage } from '@/components/leagues/leagues-index-page';
import { getDb } from '@/db';
import { pageHead } from '@/seo/head';
import { breadcrumbSchema } from '@/seo/structured-data';
import { createServices, resolvePageResult } from '@/server/container';

export type { LeagueIndexPageDto as LeagueIndexData } from '@/server/dto/leagues.dto';

const loadLeagues = createServerFn({ method: 'GET' }).handler(async () =>
    resolvePageResult(await createServices(getDb()).leagues.getIndexPage()),
);

const DESCRIPTION =
    'South Australian netball associations — AMND, Premier League, SAUCNA, SUNA, Elizabeth, City Night, SAMMNA — each with its own clubs and ladders.';

export const Route = createFileRoute('/leagues/')({
    loader: async () => await loadLeagues(),
    head: () =>
        pageHead({
            title: 'Leagues',
            description: DESCRIPTION,
            path: '/leagues',
            schema: [
                breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Leagues', path: '/leagues' },
                ]),
            ],
        }),
    component: LeaguesIndexPage,
});
