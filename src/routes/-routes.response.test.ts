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
import type { LinkTag, MetaTag } from '@/seo/head';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

let db: Db;

// oxlint-disable-next-line anti-slop/no-module-mocking -- route modules import `cloudflare:workers` transitively; there is no seam to inject a Db without reshaping every route loader
vi.mock(import('@/db'), () => ({
    getDb: (): Db => db,
}));

// oxlint-disable-next-line vitest/require-top-level-describe -- one seeded database shared by both describe blocks in this file
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

type HandlerCtx = {
    readonly request: Request;
};

type Handler = (ctx: HandlerCtx) => Promise<Response> | Response;

type ServerRouteLike = {
    readonly options: {
        readonly server?: { readonly handlers?: { readonly GET?: Handler } };
        readonly head?: (ctx: { loaderData?: unknown; params?: unknown }) => {
            meta?: readonly MetaTag[];
            links?: readonly LinkTag[];
        };
    };
};

/** A route module's `Route` export before this file has checked its shape. */
type UncheckedRoute = { readonly options?: unknown };

/** Narrows a route module's `Route` export to the surface these tests drive. */
function asRoute(route: UncheckedRoute): ServerRouteLike {
    if (route.options === undefined) {
        throw new Error('module exports no Route with options');
    }
    // SAFETY: `options` is present, and every route in this repo builds it
    // through createFileRoute/createServerFileRoute, so it carries the GET
    // handler and `head` members that `ServerRouteLike` names.
    return route as ServerRouteLike;
}

async function get(route: ServerRouteLike, path: string): Promise<Response> {
    const handler = route.options.server?.handlers?.GET;
    if (handler === undefined) {
        throw new Error('route has no GET handler');
    }
    return await handler({
        request: new Request(`https://netballsa.com${path}`),
    });
}

describe('discovery routes', () => {
    it('serves robots.txt as plain text that allows AI crawlers', async () => {
        const { Route } = await import('@/routes/robots[.]txt');
        const response = await get(asRoute(Route), '/robots.txt');
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
        const response = await get(asRoute(Route), '/sitemap.xml');
        expect(response.headers.get('content-type')).toBe(
            'application/xml; charset=utf-8',
        );
        const body = await response.text();
        expect(body).toContain('<loc>https://netballsa.com/</loc>');
        expect(body).toContain('<loc>https://netballsa.com/clubs/contax</loc>');
    });

    it('serves llms.txt as plain text in the llmstxt.org shape', async () => {
        const { Route } = await import('@/routes/llms[.]txt');
        const response = await get(asRoute(Route), '/llms.txt');
        expect(response.headers.get('content-type')).toBe(
            'text/plain; charset=utf-8',
        );
        const body = await response.text();
        expect(body.startsWith('# Netball Open Data')).toBeTruthy();
        expect(body).toContain('## Pages');
        expect(body).toContain('/clubs/contax.md');
    });

    it('serves llms-full.txt as the concatenated markdown pages', async () => {
        const { Route } = await import('@/routes/llms-full[.]txt');
        const response = await get(asRoute(Route), '/llms-full.txt');
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
    [
        '/',
        async (): Promise<{ Route: UncheckedRoute }> =>
            await import('@/routes/index'),
    ],
    [
        '/ladders',
        async (): Promise<{ Route: UncheckedRoute }> =>
            await import('@/routes/ladders'),
    ],
    [
        '/results',
        async (): Promise<{ Route: UncheckedRoute }> =>
            await import('@/routes/results'),
    ],
    [
        '/clubs',
        async (): Promise<{ Route: UncheckedRoute }> =>
            await import('@/routes/clubs.index'),
    ],
    [
        '/head-to-head',
        async (): Promise<{ Route: UncheckedRoute }> =>
            await import('@/routes/head-to-head'),
    ],
    [
        '/method',
        async (): Promise<{ Route: UncheckedRoute }> =>
            await import('@/routes/method'),
    ],
    [
        '/about',
        async (): Promise<{ Route: UncheckedRoute }> =>
            await import('@/routes/about'),
    ],
] as const;

describe('page routes', () => {
    it.each(PAGE_ROUTES)(
        'declares a canonical head for %s',
        async (path, load) => {
            const { Route } = await load();
            const head = asRoute(Route).options.head?.({});
            expect(head?.links).toContainEqual({
                rel: 'canonical',
                href: `https://netballsa.com${path}`,
            });
            expect(
                head?.meta?.some((tag) => tag['script:ld+json'] !== undefined),
            ).toBeTruthy();
            expect(
                head?.meta?.some((tag) => tag.property === 'og:title'),
            ).toBeTruthy();
        },
    );

    it('builds the club profile head from the loaded club', async () => {
        const { Route } = await import('@/routes/clubs.$clubKey');
        const head = asRoute(Route).options.head?.({
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
        const { Route } = await import('@/routes/admin');
        const head = asRoute(Route).options.head?.({});
        expect(head?.meta).toContainEqual({
            name: 'robots',
            content: 'noindex, nofollow',
        });
    });
});
