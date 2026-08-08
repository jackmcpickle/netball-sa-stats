import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { PageShell } from '@/components/ui/layout';

/**
 * Root-level fallback for `errorComponent`. Reached when a route loader
 * throws — most likely a D1 failure in production — after every other error
 * boundary in the tree has had a chance to handle it first.
 *
 * Deliberately says nothing about the error itself: no message, no stack, no
 * file path. Those are for logs, not for the public site.
 */
export function ErrorPage(): JSX.Element {
    return (
        <div className="flex min-h-screen flex-col bg-paper">
            <main className="flex flex-1 items-center">
                <PageShell className="py-24 text-center">
                    <p className="label-mono text-ink-muted">
                        {'SOMETHING WENT WRONG'}
                    </p>
                    <h1 className="mt-5 text-3xl font-medium tracking-tight text-pretty text-ink sm:text-title">
                        {'This page could not be loaded'}
                    </h1>
                    <p className="mx-auto mt-4 max-w-[52ch] leading-relaxed text-ink-body">
                        {
                            "That's on us, not you — the data behind this page didn't come back as expected. Try again in a moment."
                        }
                    </p>
                    <Link
                        to="/"
                        className="mt-8 inline-block rounded-full border border-rule px-5 py-2.5 text-sm font-semibold text-ink no-underline hover:bg-paper-raised"
                    >
                        {'Back to the championship'}
                    </Link>
                </PageShell>
            </main>
        </div>
    );
}
