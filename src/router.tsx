import { createRouter } from '@tanstack/react-router';
import type { AnyRouter } from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';

export function getRouter(): AnyRouter {
    return createRouter({
        routeTree,
        scrollRestoration: true,
        defaultPreload: 'intent',
    });
}

declare module '@tanstack/react-router' {
    // oxlint-disable-next-line typescript/consistent-type-definitions -- module augmentation only merges through an interface
    interface Register {
        router: ReturnType<typeof createRouter<typeof routeTree>>;
    }
}
