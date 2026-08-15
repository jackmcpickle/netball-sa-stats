import type { JSX } from 'react';
import type { FaqEntry } from '@/seo/structured-data';

type FaqSectionProps = {
    readonly entries: readonly FaqEntry[];
    readonly heading?: string;
};

/**
 * The questions rendered here are the same array that becomes FAQPage
 * JSON-LD, so the schema always matches the visible page. Plain markup, no
 * disclosure widget: an agent reading the HTML sees every answer.
 */
export function FaqSection({
    entries,
    heading = 'Common questions',
}: FaqSectionProps): JSX.Element {
    return (
        <section
            aria-labelledby="faq-heading"
            className="mt-16 border-t border-rule-soft pt-10"
        >
            <h2
                id="faq-heading"
                className="text-2xl font-medium tracking-tight text-ink sm:text-title"
            >
                {heading}
            </h2>
            <dl className="mt-8 grid gap-8 sm:grid-cols-2">
                {entries.map((entry) => (
                    <div key={entry.question}>
                        <dt className="text-base font-semibold text-ink">
                            {entry.question}
                        </dt>
                        <dd className="mt-2 max-w-[62ch] leading-[1.55] text-ink-body">
                            {entry.answer}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
