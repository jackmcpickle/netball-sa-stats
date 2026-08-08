import { Outlet } from '@tanstack/react-router';
import type { JSX } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

/** Header, page, footer. Every route renders inside this. */
export function RootLayout(): JSX.Element {
    return (
        <div className="flex min-h-screen flex-col bg-paper">
            <SiteHeader />
            <main className="flex-1">
                <Outlet />
            </main>
            <SiteFooter />
        </div>
    );
}
