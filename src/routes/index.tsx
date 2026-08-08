import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { Home } from '@/components/home';
import { getDb } from '@/db';
import { competitions } from '@/db/schema';
import type { Competition } from '@/db/schema';

// Placeholder until the real UI lands in phase 4.
const listCompetitions = createServerFn({ method: 'GET' }).handler(
    async (): Promise<Competition[]> =>
        getDb().select().from(competitions).all(),
);

export const Route = createFileRoute('/')({
    component: Home,
    loader: async () => listCompetitions(),
});
