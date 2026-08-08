import { createFileRoute, Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import {
    Eyebrow,
    NotAvailable,
    PageShell,
    PageTitle,
} from '@/components/ui/layout';

/**
 * The design has a full club-versus-club section. It needs match results —
 * individual fixtures with scores — and the import only holds end-of-season
 * ladders. Rendering it with sample matches would imply a feature that does
 * not exist, so the page states the gap instead.
 */
function HeadToHeadPage(): JSX.Element {
    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>{'CLUB VS CLUB'}</Eyebrow>
            <div className="mt-4 mb-8">
                <PageTitle>{'Head to head'}</PageTitle>
            </div>
            <NotAvailable
                title="Head to head needs match results, and we only hold ladders"
                reason="Every meeting between two clubs — the score, the round, the margin — comes from individual fixtures. The dataset behind this site is built from end-of-season ladders, which record how a team finished but not who it beat along the way. Until fixture-level results are imported, there is nothing here that would be true."
            >
                <p className="mt-6 text-sm text-ink-muted">
                    {'In the meantime, the '}
                    <Link
                        to="/"
                        className="text-ink"
                    >
                        {'championship rankings'}
                    </Link>
                    {' and each '}
                    <Link
                        to="/clubs"
                        className="text-ink"
                    >
                        {'club profile'}
                    </Link>
                    {' compare clubs on the record we do have.'}
                </p>
            </NotAvailable>
        </PageShell>
    );
}

export const Route = createFileRoute('/head-to-head')({
    component: HeadToHeadPage,
});
