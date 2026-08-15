import { createFileRoute } from '@tanstack/react-router';
import { getDb } from '@/db';
import { sitemapXml } from '@/seo/agent-files';
import { buildSitemapEntries } from '@/seo/sitemap';
import { createServices } from '@/server/container';

export const Route = createFileRoute('/sitemap.xml')({
    server: {
        handlers: {
            GET: async () => {
                const clubs = await createServices(getDb()).clubs.getIndexPage({
                    includePast: true,
                });
                const entries = buildSitemapEntries(
                    clubs.ok
                        ? clubs.value.entries.map((entry) => entry.club.key)
                        : [],
                );
                const body = sitemapXml(
                    entries,
                    new Date().toISOString().slice(0, 10),
                );
                return new Response(body, {
                    headers: {
                        'content-type': 'application/xml; charset=utf-8',
                        'cache-control': 'public, max-age=3600',
                    },
                });
            },
        },
    },
});
