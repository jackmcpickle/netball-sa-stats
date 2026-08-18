import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { isUndefined } from 'es-toolkit';
import { FaqPage } from '@/components/faq/faq-page';
import { getDb } from '@/db';
import { buildSiteFaq } from '@/seo/faq';
import { pageHead } from '@/seo/head';
import { breadcrumbSchema, faqSchema } from '@/seo/structured-data';
import { createServices, resolvePageResult } from '@/server/container';
import type { FaqPageDto } from '@/server/dto/faq.dto';

export type { FaqPageDto as FaqData } from '@/server/dto/faq.dto';

const loadFaq = createServerFn({ method: 'GET' }).handler(async () =>
    resolvePageResult(await createServices(getDb()).faq.getPage()),
);

const DESCRIPTION =
    'Common questions about South Australian netball club rankings, coverage and fixture results, answered from the published dataset.';

export const Route = createFileRoute('/faq')({
    loader: async () => await loadFaq(),
    head: ({ loaderData }: { loaderData?: FaqPageDto }) => {
        const entries = isUndefined(loaderData) ? [] : buildSiteFaq(loaderData);
        return pageHead({
            description: DESCRIPTION,
            path: '/faq',
            schema: [
                breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'FAQ', path: '/faq' },
                ]),
                ...(entries.length === 0 ? [] : [faqSchema(entries)]),
            ],
            title: 'Common questions',
        });
    },
    component: FaqPage,
});
