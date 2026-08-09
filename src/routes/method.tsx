import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { MethodPage } from '@/components/method/method-page';
import { getDb } from '@/db';
import { loadMethodData } from '@/server/loaders/method';

export type { MethodData } from '@/server/loaders/method';

const loadMethod = createServerFn({ method: 'GET' }).handler(async () =>
    loadMethodData(getDb()),
);

export const Route = createFileRoute('/method')({
    loader: async () => loadMethod(),
    component: MethodPage,
});
