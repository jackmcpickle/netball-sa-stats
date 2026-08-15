import type { JSX } from 'react';
import { Eyebrow, PageShell, PageTitle } from '@/components/ui/layout';
import { SITE } from '@/seo/site';

/**
 * Who publishes this, from what, and under what terms. Static prose — there
 * is nothing here that comes from the database, so the page carries no
 * loader.
 */
export function AboutPage(): JSX.Element {
    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <article className="max-w-[62ch]">
                <Eyebrow>ABOUT</Eyebrow>
                <div className="mt-4 mb-10">
                    <PageTitle>{`About ${SITE.name}`}</PageTitle>
                </div>

                <p className="text-lg leading-[1.55] text-ink-body">
                    Netball Open Data is an independent, non-commercial project
                    that turns published South Australian netball ladders into
                    one comparable club championship score per season. It is not
                    run by, affiliated with, or endorsed by Netball SA, the
                    Adelaide Metropolitan Netball Division, or any club.
                </p>

                <h2 className="mt-10 mb-4 text-lg font-semibold text-ink">
                    Where the numbers come from
                </h2>
                <p className="leading-[1.55] text-ink-body">
                    Ladders and fixtures published on PlayHQ for Netball SA and
                    AMND competitions, from 2022 onward, plus archived AMND
                    Final Premiership Placings PDFs for earlier seasons. Nothing
                    is estimated, interpolated or hand-entered: every figure
                    traces back to a published source, and seasons with no
                    recoverable source are shown as gaps rather than filled in.
                </p>

                <h2 className="mt-10 mb-4 text-lg font-semibold text-ink">
                    How to check it
                </h2>
                <p className="leading-[1.55] text-ink-body">
                    The Method page documents the scoring in full, including the
                    grade weight table and every known limitation. If a figure
                    here disagrees with a club’s own records, the Method page is
                    the place to start — the most common causes are the pre-2022
                    archive placings, which may reflect finals rather than the
                    minor-round ladder, and mid-season ladders, which are never
                    ranked.
                </p>

                <h2 className="mt-10 mb-4 text-lg font-semibold text-ink">
                    For machines
                </h2>
                <p className="leading-[1.55] text-ink-body">
                    {
                        'Every page is also served as markdown: append .md to any URL, or send an Accept: text/markdown header. '
                    }
                    <a
                        href="/llms.txt"
                        className="underline decoration-rule underline-offset-2"
                    >
                        /llms.txt
                    </a>
                    {' indexes the site for language models, and '}
                    <a
                        href="/llms-full.txt"
                        className="underline decoration-rule underline-offset-2"
                    >
                        /llms-full.txt
                    </a>
                    {
                        ' concatenates the core pages into one document. Crawling and citing this site is explicitly permitted; see /robots.txt.'
                    }
                </p>

                <h2 className="mt-10 mb-4 text-lg font-semibold text-ink">
                    Corrections
                </h2>
                <p className="leading-[1.55] text-ink-body">
                    Errors are expected in a dataset assembled from twenty-five
                    years of published results, and corrections are welcome —
                    particularly for the archive seasons, where the source PDFs
                    are the only record.
                </p>
            </article>
        </PageShell>
    );
}
