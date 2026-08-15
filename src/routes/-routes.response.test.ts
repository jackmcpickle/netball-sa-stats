/**
 * Response-type coverage for every route: the discovery files must come back
 * as the content type crawlers expect, and every page route must declare a
 * head with a canonical URL and structured data.
 *
 * Route modules that touch the database import `cloudflare:workers`
 * transitively, so the db module is stubbed and the handlers are driven with
 * the in-memory test harness instead.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

let db: Db;

vi.mock('@/db', () => ({
    getDb: (): Db => db,
}));

beforeAll(async () => {
    db = createTestDb();
    await seed(db, {
        competitions: [
            {
                key: 'amnd',
                name: 'AMND',
                seasons: [
                    {
                        seasonKey: 'amnd-2024',
                        startYear: 2024,
                        isFinal: true,
                        grades: [
                            {
                                gradeKey: 'amnd-2024-a1',
                                name: 'A1',
                                tier: 1,
                                teamCount: 2,
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        ladderPosition: 1,
                                    },
                                    {
                                        clubKey: 'garville',
                                        clubName: 'Garville',
                                        displayName: 'Garville',
                                        ladderPosition: 2,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

interface HandlerCtx {
    readonly request: Request;
}

type Handler = (ctx: HandlerCtx) => Promise<Response> | Response;

interface ServerRouteLike {
    readonly options: {
        readonly server?: { readonly handlers?: { readonly GET?: Handler } };
        readonly head?: (ctx: { loaderData?: unknown; params?: unknown }) => {
            meta?: readonly Record<string, unknown>[];
            links?: readonly Record<string, unknown>[];
        };
    };
}

async function get(route: ServerRouteLike, path: string): Promise<Response> {
    const handler = route.options.server?.handlers?.GET;
    if (handler === undefined) {
        throw new Error('route has no GET handler');
    }
    return handler({
        request: new Request(`https://netballsa.com${path}`),
    });
}

describe('discovery routes', () => {
    it('serves robots.txt as plain text that allows AI crawlers', async () => {
        const { Route } = await import('@/routes/robots[.]txt');
        const response = await get(Route as ServerRouteLike, '/robots.txt');
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe(
            'text/plain; charset=utf-8',
        );
        const body = await response.text();
        expect(body).toContain('User-agent: ClaudeBot');
        expect(body).toContain('Sitemap: https://netballsa.com/sitemap.xml');
    });

    it('serves sitemap.xml as XML listing club pages', async () => {
        const { Route } = await import('@/routes/sitemap[.]xml');
        const response = await get(Route as ServerRouteLike, '/sitemap.xml');
        expect(response.headers.get('content-type')).toBe(
            'application/xml; charset=utf-8',
        );
        const body = await response.text();
        expect(body).toContain('<loc>https://netballsa.com/</loc>');
        expect(body).toContain('<loc>https://netballsa.com/clubs/contax</loc>');
    });

    it('serves llms.txt as plain text in the llmstxt.org shape', async () => {
        const { Route } = await import('@/routes/llms[.]txt');
        const response = await get(Route as ServerRouteLike, '/llms.txt');
        expect(response.headers.get('content-type')).toBe(
            'text/plain; charset=utf-8',
        );
        const body = await response.text();
        expect(body.startsWith('# Netball Open Data')).toBe(true);
        expect(body).toContain('## Pages');
        expect(body).toContain('/clubs/contax.md');
    });

    it('serves llms-full.txt as the concatenated markdown pages', async () => {
        const { Route } = await import('@/routes/llms-full[.]txt');
        const response = await get(Route as ServerRouteLike, '/llms-full.txt');
        expect(response.headers.get('content-type')).toBe(
            'text/plain; charset=utf-8',
        );
        const body = await response.text();
        expect(body).toContain('# Club championship 2024');
        expect(body).toContain('# Method');
        expect(body).toContain('\n---\n');
    });
});

const PAGE_ROUTES = [
    ['@/routes/index', '/'],
    ['@/routes/ladders', '/ladders'],
    ['@/routes/results', '/results'],
    ['@/routes/clubs.index', '/clubs'],
    ['@/routes/head-to-head', '/head-to-head'],
    ['@/routes/method', '/method'],
    ['@/routes/about', '/about'],
] as const;

describe('page routes', () => {
    it.each(PAGE_ROUTES)(
        '%s declares a canonical head for %s',
        async (module, path) => {
            const { Route } = (await import(module)) as {
                Route: ServerRouteLike;
            };
            const head = Route.options.head?.({});
            expect(head?.links).toContainEqual({
                rel: 'canonical',
                href: `https://netballsa.com${path}`,
            });
            expect(
                head?.meta?.some((tag) => tag['script:ld+json'] !== undefined),
            ).toBe(true);
            expect(
                head?.meta?.some((tag) => tag['property'] === 'og:title'),
            ).toBe(true);
        },
    );

    it('builds the club profile head from the loaded club', async () => {
        const { Route } = (await import('@/routes/clubs.$clubKey')) as {
            Route: ServerRouteLike;
        };
        const head = Route.options.head?.({
            params: { clubKey: 'contax' },
            loaderData: {
                profile: {
                    club: {
                        key: 'contax',
                        name: 'Contax',
                        homeVenue: null,
                        establishedYear: null,
                    },
                    currentRank: 1,
                    bestRank: 1,
                    bestRankYear: 2024,
                    careerPoints: 12,
                    minorPremierships: 1,
                    seasons: [{ year: 2024 }],
                },
            },
        });
        expect(head?.links).toContainEqual({
            rel: 'canonical',
            href: 'https://netballsa.com/clubs/contax',
        });
        expect(JSON.stringify(head?.meta)).toContain('SportsTeam');
        expect(JSON.stringify(head?.meta)).toContain('Contax');
    });

    it('keeps admin out of search indexes', async () => {
        const { Route } = (await import('@/routes/admin')) as {
            Route: ServerRouteLike;
        };
        const head = Route.options.head?.({});
        expect(head?.meta).toContainEqual({
            name: 'robots',
            content: 'noindex, nofollow',
        });
    });
});
