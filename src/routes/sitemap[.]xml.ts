import { createFileRoute } from '@tanstack/react-router';
import { getDb } from '@/db';
import { sitemapXml } from '@/seo/agent-files';
import { buildSitemapEntries } from '@/seo/sitemap';
import { createServices } from '@/server/container';

export const Route = createFileRoute('/sitemap.xml')({
    server: {
        handlers: {
            GET: async () => {
                const services = createServices(getDb());
                const [clubs, leagues] = await Promise.all([
                    services.clubs.getIndexPage({ includePast: true }),
                    services.leagues.getIndexPage(),
                ]);
                const entries = buildSitemapEntries(
                    clubs.ok
                        ? [...new Set(clubs.value.entries.map((entry) => entry.club.key))]
                        : [],
                    leagues.ok
                        ? leagues.value.leagues.map(
                              (entry) => entry.competition.key,
                          )
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
