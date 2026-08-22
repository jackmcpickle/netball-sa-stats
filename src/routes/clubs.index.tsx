import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ClubIndexPage } from '@/components/club/club-index-page';
import { getDb } from '@/db';
import { parseOptionalBoolParam } from '@/routes/-search-params';
import { pageHead } from '@/seo/head';
import { breadcrumbSchema } from '@/seo/structured-data';
import { createServices, resolvePageResult } from '@/server/container';

export type {
    ClubIndexEntry,
    ClubIndexPageDto as ClubIndexData,
} from '@/server/dto/clubs.dto';

const searchSchema = z.object({
    includePast: z.preprocess(parseOptionalBoolParam, z.boolean().optional()),
});

const loadClubs = createServerFn({ method: 'GET' })
    .validator(z.object({ includePast: z.boolean().optional() }))
    .handler(async ({ data }) =>
        resolvePageResult(
            await createServices(getDb()).clubs.getIndexPage(data),
        ),
    );

const DESCRIPTION =
    'South Australian netball clubs grouped by league — AMND, Premier League and Reserves separately — including clubs no longer fielding teams.';

export const Route = createFileRoute('/clubs/')({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({ includePast: search.includePast }),
    loader: async ({ deps }) =>
        await loadClubs({ data: { includePast: deps.includePast } }),
    head: () =>
        pageHead({
            title: 'Clubs',
            description: DESCRIPTION,
            path: '/clubs',
            schema: [
                breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Clubs', path: '/clubs' },
                ]),
            ],
        }),
    component: ClubIndexPage,
});
