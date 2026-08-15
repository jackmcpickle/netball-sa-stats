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
    .handler(async ({ data }) => {
        return resolvePageResult(
            await createServices(getDb()).clubs.getIndexPage(data),
        );
    });

const DESCRIPTION =
    'Every South Australian netball club in the dataset, with the seasons it competed in and its championship record — including clubs no longer fielding teams.';

export const Route = createFileRoute('/clubs/')({
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
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({ includePast: search.includePast }),
    loader: async ({ deps }) =>
        loadClubs({ data: { includePast: deps.includePast } }),
    component: ClubIndexPage,
});
