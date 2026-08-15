import { createFileRoute } from '@tanstack/react-router';
import { getDb } from '@/db';
import { llmsTxt } from '@/seo/agent-files';
import { createServices } from '@/server/container';

export const Route = createFileRoute('/llms.txt')({
    server: {
        handlers: {
            GET: async () => {
                const services = createServices(getDb());
                const [method, clubs] = await Promise.all([
                    services.method.getPage(),
                    services.clubs.getIndexPage({ includePast: true }),
                ]);
                const coverage = method.ok ? method.value.coverage : null;
                const body = llmsTxt({
                    rankedYears: coverage?.rankedYears ?? [],
                    competitions:
                        coverage?.competitions.map(
                            (entry) => entry.competition.name,
                        ) ?? [],
                    clubs: clubs.ok
                        ? clubs.value.entries.map((entry) => ({
                              key: entry.club.key,
                              name: entry.club.name,
                          }))
                        : [],
                    isSampleData: coverage?.isSampleData ?? false,
                });
                return new Response(body, {
                    headers: {
                        'content-type': 'text/plain; charset=utf-8',
                        'cache-control': 'public, max-age=900',
                    },
                });
            },
        },
    },
});
