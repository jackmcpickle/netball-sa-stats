import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import type { JSX } from 'react';
import { z } from 'zod';
import { ClubProfilePage } from '@/components/club/club-profile-page';
import { PageShell } from '@/components/ui/layout';
import { getDb } from '@/db';
import { tableSearchSchema } from '@/routes/-table-params';
import { describeClub } from '@/seo/descriptions';
import { pageHead } from '@/seo/head';
import { absoluteUrl } from '@/seo/site';
import { breadcrumbSchema } from '@/seo/structured-data';
import { createServices, resolvePageResult } from '@/server/container';
import type { ClubProfilePageDto } from '@/server/dto/club-profile.dto';

export type { ClubProfilePageDto as ClubProfileData } from '@/server/dto/club-profile.dto';

const loadClub = createServerFn({ method: 'GET' })
    .validator(
        z.object({
            clubKey: z.string(),
            sort: z.string().optional(),
            dir: z.enum(['asc', 'desc']).optional(),
            page: z.number().int().optional(),
            pageSize: z.number().int().optional(),
        }),
    )
    .handler(async ({ data }) =>
        resolvePageResult(
            await createServices(getDb()).clubs.getProfilePage(data),
        ),
    );

function ClubNotFound(): JSX.Element {
    return (
        <PageShell className="py-24">
            <h1 className="text-3xl font-medium tracking-tight text-ink">
                No such club
            </h1>
            <p className="mt-4 text-ink-body">
                That club is not in the dataset. Try the club list.
            </p>
        </PageShell>
    );
}

export const Route = createFileRoute('/clubs/$clubKey')({
    validateSearch: tableSearchSchema,
    loaderDeps: ({ search }) => ({
        sort: search.sort,
        dir: search.dir,
        page: search.page,
        pageSize: search.pageSize,
    }),
    loader: async ({ params, deps }) =>
        await loadClub({ data: { clubKey: params.clubKey, ...deps } }),
    // `loaderData` is annotated rather than inferred: reading it inside
    // `head()` otherwise feeds the route's own loader type back into itself,
    // and the whole route collapses to `undefined`.
    head: ({
        loaderData,
        params,
    }: {
        loaderData?: ClubProfilePageDto;
        params: { clubKey: string };
    }) => {
        const path = `/clubs/${params.clubKey}`;
        const profile = loaderData?.profile;
        const establishedYear = profile?.club.establishedYear;
        const name = profile?.club.name ?? 'Club';
        const description =
            profile === undefined
                ? `Championship record, ladder finishes and strength trend for ${name} in South Australian netball.`
                : describeClub(profile);
        return pageHead({
            title: name,
            description,
            path,
            schema: [
                {
                    '@type': 'SportsTeam',
                    name,
                    sport: 'Netball',
                    url: absoluteUrl(path),
                    // `undefined` members are dropped by `JSON.stringify`, so
                    // an unknown venue or founding year simply omits the key.
                    location: profile?.club.homeVenue ?? undefined,
                    foundingDate:
                        establishedYear === null ||
                        establishedYear === undefined
                            ? undefined
                            : String(establishedYear),
                    memberOf: {
                        '@type': 'SportsOrganization',
                        name: 'Netball SA',
                    },
                },
                breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Clubs', path: '/clubs' },
                    { name, path },
                ]),
            ],
        });
    },
    component: ClubProfilePage,
    notFoundComponent: ClubNotFound,
});
