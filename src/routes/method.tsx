import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { MethodPage } from '@/components/method/method-page';
import { getDb } from '@/db';
import { createServices, resolvePageResult } from '@/server/container';

export type { MethodPageDto as MethodData } from '@/server/dto/method.dto';

const loadMethod = createServerFn({ method: 'GET' }).handler(async () => {
    return resolvePageResult(await createServices(getDb()).method.getPage());
});

export const Route = createFileRoute('/method')({
    loader: async () => loadMethod(),
    component: MethodPage,
});
