import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { MethodPage } from '@/components/method/method-page';
import { getDb } from '@/db';
import { createServices, describeDomainError } from '@/server/container';

export type { MethodPageDto as MethodData } from '@/server/dto/method.dto';

const loadMethod = createServerFn({ method: 'GET' }).handler(async () => {
    const result = await createServices(getDb()).method.getPage();
    if (!result.ok) {
        if (result.error.kind === 'not-found') throw notFound();
        throw new Error(describeDomainError(result.error));
    }
    return result.value;
});

export const Route = createFileRoute('/method')({
    loader: async () => loadMethod(),
    component: MethodPage,
});
