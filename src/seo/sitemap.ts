/**
 * The site's URL inventory. Kept apart from the route handler so the list can
 * be asserted in a test without a database.
 */
import type { SitemapEntry } from '@/seo/agent-files';

const STATIC_ENTRIES: readonly SitemapEntry[] = [
    { path: '/', changefreq: 'daily', priority: '1.0' },
    { path: '/ladders', changefreq: 'daily', priority: '0.9' },
    { path: '/results', changefreq: 'daily', priority: '0.9' },
    { path: '/clubs', changefreq: 'weekly', priority: '0.8' },
    { path: '/head-to-head', changefreq: 'weekly', priority: '0.7' },
    { path: '/method', changefreq: 'monthly', priority: '0.7' },
    { path: '/about', changefreq: 'monthly', priority: '0.6' },
];

export function buildSitemapEntries(
    clubKeys: readonly string[],
): readonly SitemapEntry[] {
    return [
        ...STATIC_ENTRIES,
        ...clubKeys.map((key) => ({
            path: `/clubs/${key}`,
            changefreq: 'weekly' as const,
            priority: '0.6',
        })),
    ];
}
