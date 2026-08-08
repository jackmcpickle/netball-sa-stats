import { Link, useLocation } from '@tanstack/react-router';
import type { JSX } from 'react';

interface NavItem {
    readonly to: string;
    readonly label: string;
}

/**
 * `Results` and `Head to head` are in the nav on purpose: both are named in the
 * design, and hiding them would quietly imply the site never intended to have
 * them. Each lands on an explicit "not available yet" page.
 */
const NAV: readonly NavItem[] = [
    { to: '/', label: 'Rankings' },
    { to: '/clubs', label: 'Clubs' },
    { to: '/ladders', label: 'Ladders' },
    { to: '/head-to-head', label: 'Head to head' },
    { to: '/results', label: 'Results' },
    { to: '/method', label: 'Method' },
];

function isActive(pathname: string, to: string): boolean {
    return to === '/' ? pathname === '/' : pathname.startsWith(to);
}

export function SiteHeader(): JSX.Element {
    const { pathname } = useLocation();

    return (
        <header className="sticky top-0 z-20 border-b border-rule bg-paper">
            <div className="mx-auto flex h-16 max-w-shell items-center gap-4 px-5 sm:gap-8 sm:px-8">
                <Link
                    to="/"
                    className="flex shrink-0 items-center gap-2.5 no-underline"
                >
                    <span
                        aria-hidden="true"
                        className="size-[26px] rounded-full bg-brand"
                    />
                    <span className="text-base font-semibold tracking-[-0.2px] text-ink">
                        {'Netball Open Data'}
                    </span>
                </Link>

                <nav
                    aria-label="Sections"
                    className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1"
                >
                    {NAV.map((item) => (
                        <Link
                            key={item.to}
                            to={item.to}
                            aria-current={
                                isActive(pathname, item.to) ? 'page' : undefined
                            }
                            className={`rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap no-underline transition-colors ${
                                isActive(pathname, item.to)
                                    ? 'bg-paper-sunken text-ink'
                                    : 'text-ink-muted hover:text-ink'
                            }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <span className="label-mono hidden shrink-0 rounded-full bg-paper-sunken px-3 py-1.5 md:inline">
                    {'SAMPLE DATA'}
                </span>
            </div>
        </header>
    );
}
