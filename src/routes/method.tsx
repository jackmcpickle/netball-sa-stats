import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { isNull, isUndefined } from 'es-toolkit';
import { MethodPage } from '@/components/method/method-page';
import { getDb } from '@/db';
import { METHOD_FAQ } from '@/seo/faq';
import { pageHead } from '@/seo/head';
import { breadcrumbSchema, faqSchema } from '@/seo/structured-data';
import { createServices, resolvePageResult } from '@/server/container';
import type { MethodPageDto } from '@/server/dto/method.dto';

export type { MethodPageDto as MethodData } from '@/server/dto/method.dto';

const loadMethod = createServerFn({ method: 'GET' }).handler(async () =>
    resolvePageResult(await createServices(getDb()).method.getPage()),
);

const DESCRIPTION =
    'How the South Australian netball club championship is calculated: grade weightings, what counts as a ranked season, and the documented gaps in the data.';

export const Route = createFileRoute('/method')({
    loader: async () => await loadMethod(),
    // Annotated, not inferred — see the note on the club profile route.
    head: ({ loaderData }: { loaderData?: MethodPageDto }) =>
        pageHead({
            title: 'Method',
            description: DESCRIPTION,
            path: '/method',
            dateModified:
                isUndefined(loaderData) || isNull(loaderData.updatedAt)
                    ? undefined
                    : new Date(loaderData.updatedAt * 1000).toISOString(),
            schema: [
                breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'Method', path: '/method' },
                ]),
                faqSchema(METHOD_FAQ),
            ],
        }),
    component: MethodPage,
});
