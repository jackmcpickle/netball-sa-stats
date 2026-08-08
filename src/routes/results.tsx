import { createFileRoute, Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import {
    Eyebrow,
    NotAvailable,
    PageShell,
    PageTitle,
} from '@/components/ui/layout';

/**
 * Same gap as head to head: the design lists round-by-round scorelines, and
 * the dataset holds ladders only.
 */
function ResultsPage(): JSX.Element {
    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>{'MATCH RESULTS'}</Eyebrow>
            <div className="mt-4 mb-8">
                <PageTitle>{'Results'}</PageTitle>
            </div>
            <NotAvailable
                title="Round-by-round results are not imported yet"
                reason="This page is meant to list every fixture with its score and margin. The import currently reads published ladders, which summarise a season rather than list it. No scoreline on this site would be a real one, so none is shown."
            >
                <p className="mt-6 text-sm text-ink-muted">
                    {'Season standings are on the '}
                    <Link
                        to="/ladders"
                        className="text-ink"
                    >
                        {'ladders page'}
                    </Link>
                    {'.'}
                </p>
            </NotAvailable>
        </PageShell>
    );
}

export const Route = createFileRoute('/results')({
    component: ResultsPage,
});
