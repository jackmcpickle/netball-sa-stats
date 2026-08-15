import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { NETBALL_ICON_ATTRIBUTION } from '@/components/branding';
import { NetballMark } from '@/components/netball-mark';

export function SiteFooter(): JSX.Element {
    return (
        <footer className="border-t border-rule bg-paper-raised px-4 py-14 sm:px-8 sm:py-20">
            <div className="mx-auto grid max-w-shell gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] lg:gap-8">
                <div>
                    <div className="mb-3 flex items-center gap-2.5">
                        <NetballMark className="size-[22px] shrink-0 text-brand" />
                        <span className="text-[15px] font-semibold text-ink">
                            {'Netball Open Data'}
                        </span>
                    </div>
                    <p className="max-w-[38ch] text-sm leading-relaxed text-ink-body">
                        {
                            'Open club rankings for South Australian netball. Free to use, free to check, free to argue with.'
                        }
                    </p>
                </div>

                <nav
                    aria-label="Explore"
                    className="grid content-start gap-2.5"
                >
                    <h2 className="label-mono">{'EXPLORE'}</h2>
                    <Link
                        to="/"
                        className="text-sm text-ink-body no-underline hover:underline"
                    >
                        {'Rankings'}
                    </Link>
                    <Link
                        to="/clubs"
                        className="text-sm text-ink-body no-underline hover:underline"
                    >
                        {'Clubs'}
                    </Link>
                    <Link
                        to="/ladders"
                        className="text-sm text-ink-body no-underline hover:underline"
                    >
                        {'Ladders'}
                    </Link>
                </nav>

                <nav
                    aria-label="Data"
                    className="grid content-start gap-2.5"
                >
                    <h2 className="label-mono">{'DATA'}</h2>
                    <Link
                        to="/method"
                        className="text-sm text-ink-body no-underline hover:underline"
                    >
                        {'Method'}
                    </Link>
                    <Link
                        to="/about"
                        className="text-sm text-ink-body no-underline hover:underline"
                    >
                        {'About'}
                    </Link>
                    <a
                        href="/llms.txt"
                        className="text-sm text-ink-body no-underline hover:underline"
                    >
                        {'llms.txt'}
                    </a>
                    {/* Named, not linked: neither exists yet. */}
                    <span className="text-sm text-ink-faint">
                        {'CSV export — not yet'}
                    </span>
                    <span className="text-sm text-ink-faint">
                        {'JSON API — not yet'}
                    </span>
                </nav>

                <div className="grid content-start gap-2.5">
                    <h2 className="label-mono">{'SOURCES'}</h2>
                    <span className="text-sm text-ink-faint">
                        {'Netball SA'}
                    </span>
                    <span className="text-sm text-ink-faint">
                        {'PlayHQ ladders'}
                    </span>
                    <span className="text-sm text-ink-faint">
                        {'Adelaide Metropolitan Netball Division'}
                    </span>
                </div>
            </div>

            <p className="mx-auto mt-10 max-w-shell text-xs leading-relaxed text-ink-faint">
                {'netball by '}
                {NETBALL_ICON_ATTRIBUTION.creator}
                {' from '}
                <a
                    href={NETBALL_ICON_ATTRIBUTION.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={NETBALL_ICON_ATTRIBUTION.title}
                    className="text-ink-faint underline decoration-rule underline-offset-2 hover:text-ink-muted"
                >
                    {'Noun Project'}
                </a>
                {` (${NETBALL_ICON_ATTRIBUTION.license})`}
            </p>
        </footer>
    );
}
