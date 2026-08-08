import { createRouter, type AnyRouter } from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';

export function getRouter(): AnyRouter {
    return createRouter({
        routeTree,
        scrollRestoration: true,
        defaultPreload: 'intent',
    });
}

declare module '@tanstack/react-router' {
    interface Register {
        router: ReturnType<typeof createRouter<typeof routeTree>>;
    }
}
