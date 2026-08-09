import { Outlet } from '@tanstack/react-router';
import type { JSX } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

/** Header, page, footer. Every route renders inside this. */
export function RootLayout(): JSX.Element {
    return (
        <div className="flex min-h-screen flex-col overflow-x-clip bg-paper">
            <SiteHeader />
            <main className="min-w-0 flex-1">
                <Outlet />
            </main>
            <SiteFooter />
        </div>
    );
}
