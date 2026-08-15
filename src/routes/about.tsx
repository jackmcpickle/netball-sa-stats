import { createFileRoute } from '@tanstack/react-router';
import { AboutPage } from '@/components/about-page';
import { pageHead } from '@/seo/head';
import { breadcrumbSchema } from '@/seo/structured-data';

const DESCRIPTION =
    'Who publishes Netball Open Data, where the South Australian netball figures come from, how to check them, and how machines can read the site.';

export const Route = createFileRoute('/about')({
    head: () =>
        pageHead({
            title: 'About',
            description: DESCRIPTION,
            path: '/about',
            schema: [
                breadcrumbSchema([
                    { name: 'Home', path: '/' },
                    { name: 'About', path: '/about' },
                ]),
            ],
        }),
    component: AboutPage,
});
