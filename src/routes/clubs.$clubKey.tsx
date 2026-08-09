import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import type { JSX } from 'react';
import { z } from 'zod';
import { ClubProfilePage } from '@/components/club/club-profile-page';
import { PageShell } from '@/components/ui/layout';
import { getDb } from '@/db';
import { tableSearchSchema } from '@/routes/-table-params';
import { loadClubProfileData } from '@/server/loaders/club-profile';

export type { ClubProfileData } from '@/server/loaders/club-profile';

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
    .handler(async ({ data }) => loadClubProfileData(getDb(), data));

function ClubNotFound(): JSX.Element {
    return (
        <PageShell className="py-24">
            <h1 className="text-3xl font-medium tracking-tight text-ink">
                {'No such club'}
            </h1>
            <p className="mt-4 text-ink-body">
                {'That club is not in the dataset. Try the club list.'}
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
    loader: async ({ params, deps }) => {
        const data = await loadClub({
            data: { clubKey: params.clubKey, ...deps },
        });
        if (!data) {
            throw notFound();
        }
        return data;
    },
    component: ClubProfilePage,
    notFoundComponent: ClubNotFound,
});
