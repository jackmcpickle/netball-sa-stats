import { Link, useLocation } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { NetballMark } from '@/components/netball-mark';

interface NavItem {
    readonly to: string;
    readonly label: string;
}

/**
 * `Results` and `Head to head` are fixture-backed, and fixtures only cover
 * 2025 onwards — each page says so where the data runs out, rather than
 * being hidden from the nav for the seasons it cannot answer.
 */
const NAV: readonly NavItem[] = [
    { to: '/', label: 'Rankings' },
    { to: '/clubs', label: 'Clubs' },
    { to: '/ladders', label: 'Ladders' },
    { to: '/head-to-head', label: 'Head to head' },
    { to: '/results', label: 'Results' },
    { to: '/method', label: 'Method' },
    { to: '/about', label: 'About' },
];

function isActive(pathname: string, to: string): boolean {
    return to === '/' ? pathname === '/' : pathname.startsWith(to);
}

function navLinkClass(active: boolean): string {
    return `rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap no-underline transition-colors ${
        active ? 'bg-paper-sunken text-ink' : 'text-ink-muted hover:text-ink'
    }`;
}

function menuGlyph(open: boolean): JSX.Element {
    return (
        <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="size-5"
        >
            {open ? (
                <path
                    d="M5 5 15 15 M15 5 5 15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                />
            ) : (
                <path
                    d="M4 6h12 M4 10h12 M4 14h12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                />
            )}
        </svg>
    );
}

export function SiteHeader(): JSX.Element {
    const { pathname } = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);

    const toggleMenu = useCallback(() => {
        setMenuOpen((open) => !open);
    }, []);

    // Route changes should collapse the drawer — otherwise the overlay stays
    // open over the page the user just asked to see.
    useEffect(() => {
        // oxlint-disable-next-line react/react-compiler -- closing the drawer on navigation is exactly the external-to-React sync this effect is for; the router owns `pathname`
        setMenuOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!menuOpen) {
            return undefined;
        }
        function onKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                setMenuOpen(false);
            }
        }
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [menuOpen]);

    return (
        <header className="sticky top-0 z-20 border-b border-rule bg-paper">
            <div className="mx-auto flex h-14 max-w-shell items-center gap-3 px-4 sm:h-16 sm:gap-8 sm:px-8">
                <Link
                    to="/"
                    className="flex min-w-0 shrink items-center gap-2.5 no-underline"
                >
                    <NetballMark className="size-[26px] shrink-0 text-brand" />
                    <span className="truncate text-base font-semibold tracking-[-0.2px] text-ink">
                        Netball Open Data
                    </span>
                </Link>

                <nav
                    aria-label="Sections"
                    className="ml-auto hidden items-center gap-1 md:flex"
                >
                    {NAV.map((item) => (
                        <Link
                            key={item.to}
                            to={item.to}
                            aria-current={
                                isActive(pathname, item.to) ? 'page' : undefined
                            }
                            className={navLinkClass(
                                isActive(pathname, item.to),
                            )}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <button
                    type="button"
                    className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-field text-ink md:hidden"
                    aria-expanded={menuOpen}
                    aria-controls="mobile-nav"
                    onClick={toggleMenu}
                >
                    <span className="sr-only">
                        {menuOpen ? 'Close menu' : 'Open menu'}
                    </span>
                    {menuGlyph(menuOpen)}
                </button>
            </div>

            <nav
                id="mobile-nav"
                aria-label="Sections"
                hidden={!menuOpen}
                className="border-t border-rule bg-paper md:hidden"
            >
                <ul className="mx-auto flex max-w-shell list-none flex-col gap-1 px-4 py-3 sm:px-8">
                    {NAV.map((item) => (
                        <li key={item.to}>
                            <Link
                                to={item.to}
                                aria-current={
                                    isActive(pathname, item.to)
                                        ? 'page'
                                        : undefined
                                }
                                className={`block ${navLinkClass(isActive(pathname, item.to))}`}
                            >
                                {item.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
        </header>
    );
}
