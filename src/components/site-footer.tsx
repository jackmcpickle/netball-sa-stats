import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';

export function SiteFooter(): JSX.Element {
    return (
        <footer className="border-t border-rule bg-paper-raised px-4 py-14 sm:px-8 sm:py-20">
            <div className="mx-auto grid max-w-shell gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] lg:gap-8">
                <div>
                    <div className="mb-3 flex items-center gap-2.5">
                        <span
                            aria-hidden="true"
                            className="size-[22px] rounded-full bg-brand"
                        />
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
        </footer>
    );
}
