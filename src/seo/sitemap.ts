/**
 * The site's URL inventory. Kept apart from the route handler so the list can
 * be asserted in a test without a database.
 */
import type { SitemapEntry } from '@/seo/agent-files';

const STATIC_ENTRIES: readonly SitemapEntry[] = [
    { changefreq: 'daily', path: '/', priority: '1.0' },
    { changefreq: 'daily', path: '/ladders', priority: '0.9' },
    { changefreq: 'daily', path: '/results', priority: '0.9' },
    { changefreq: 'weekly', path: '/clubs', priority: '0.8' },
    { changefreq: 'weekly', path: '/head-to-head', priority: '0.7' },
    { changefreq: 'weekly', path: '/faq', priority: '0.6' },
    { changefreq: 'monthly', path: '/method', priority: '0.7' },
    { changefreq: 'monthly', path: '/about', priority: '0.6' },
];

export function buildSitemapEntries(
    clubKeys: readonly string[],
): readonly SitemapEntry[] {
    return [
        ...STATIC_ENTRIES,
        ...clubKeys.map((key) => ({
            changefreq: 'weekly' as const,
            path: `/clubs/${key}`,
            priority: '0.6',
        })),
    ];
}
