/* oxlint-disable react/jsx-curly-brace-presence -- plan: string literals in JSX wrapped in braces */
import { getRouteApi } from '@tanstack/react-router';
import type { JSX } from 'react';
import { FaqSection } from '@/components/faq-section';
import { Eyebrow, PageShell, PageTitle } from '@/components/ui/layout';
import { buildSiteFaq } from '@/seo/faq';

const routeApi = getRouteApi('/faq');

export function FaqPage(): JSX.Element {
    const data = routeApi.useLoaderData();
    const entries = buildSiteFaq(data);
    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <article className="max-w-[62ch]">
                <Eyebrow>{'FAQ'}</Eyebrow>
                <div className="mt-4 mb-10">
                    <PageTitle>{'Common questions'}</PageTitle>
                </div>
                <p className="text-lg leading-[1.55] text-ink-body">
                    {
                        'Answers about South Australian netball clubs, championship rankings and fixture results, built from the published dataset on this site.'
                    }
                </p>
            </article>
            {entries.length > 0 ? (
                <FaqSection
                    entries={entries}
                    heading={'Questions'}
                />
            ) : null}
        </PageShell>
    );
}
