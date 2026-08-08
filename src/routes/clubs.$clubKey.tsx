import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import type { JSX } from 'react';
import { z } from 'zod';
import { ClubProfilePage } from '@/components/club/club-profile-page';
import { PageShell } from '@/components/ui/layout';
import { getClubProfile, listClubs } from '@/data';
import type { Club, ClubProfile } from '@/data/types';

export interface ClubProfileData {
    readonly profile: ClubProfile;
    readonly clubs: readonly Club[];
}

const loadClub = createServerFn({ method: 'GET' })
    .validator(z.object({ clubKey: z.string() }))
    .handler(async ({ data }): Promise<ClubProfileData | null> => {
        const profile = await getClubProfile(data.clubKey);
        return profile ? { profile, clubs: await listClubs() } : null;
    });

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
    loader: async ({ params }) => {
        const data = await loadClub({ data: { clubKey: params.clubKey } });
        if (!data) {
            throw notFound();
        }
        return data;
    },
    component: ClubProfilePage,
    notFoundComponent: ClubNotFound,
});
