import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { Home } from '@/components/home';
import { getDb } from '@/db';
import { teams } from '@/db/schema';
import type { Team } from '@/db/schema';

const listTeams = createServerFn({ method: 'GET' }).handler(
    async (): Promise<Team[]> => getDb().select().from(teams).all(),
);

export const Route = createFileRoute('/')({
    component: Home,
    loader: async () => listTeams(),
});
