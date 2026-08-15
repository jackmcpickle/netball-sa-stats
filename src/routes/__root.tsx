/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import type { JSX, ReactNode } from 'react';
import { ErrorPage } from '@/components/error-page';
import { RootLayout } from '@/components/root-layout';
import appCss from '@/style.css?url';

function RootDocument({ children }: { children: ReactNode }): JSX.Element {
    return (
        <html lang="en-AU">
            <head>
                <HeadContent />
            </head>
            <body className="bg-paper text-ink-body">
                {children}
                <Scripts />
            </body>
        </html>
    );
}

export const Route = createRootRoute({
    head: () => ({
        meta: [
            { charSet: 'utf-8' },
            {
                name: 'viewport',
                content: 'width=device-width, initial-scale=1',
            },
            { title: 'Netball Open Data — South Australian club rankings' },
            { name: 'theme-color', content: '#1f6feb' },
            {
                name: 'description',
                content:
                    'Ladder finishes across every grade and season, weighted by grade and added up into a single club championship score for South Australian netball.',
            },
        ],
        links: [
            { rel: 'stylesheet', href: appCss },
            { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
            { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
            { rel: 'manifest', href: '/site.webmanifest' },
            { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
            {
                rel: 'preconnect',
                href: 'https://fonts.gstatic.com',
                crossOrigin: 'anonymous',
            },
            {
                rel: 'stylesheet',
                href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap',
            },
        ],
    }),
    shellComponent: RootDocument,
    component: RootLayout,
    errorComponent: ErrorPage,
});
