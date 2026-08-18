/**
 * Global request middleware, in the order it runs:
 *
 * 1. `www.netballsa.com` redirects to the apex, which is the canonical host.
 * 2. A request for `/thing.md`, or any page request whose `Accept` prefers
 *    `text/markdown`, is answered with the markdown twin of that page.
 * 3. Every response advertises its canonical URL and markdown twin in `Link`
 *    headers, so an agent can discover both without parsing HTML.
 */
import { createMiddleware, createStart } from '@tanstack/react-start';
import { isNull, isUndefined } from 'es-toolkit';
import { getDb } from '@/db';
import { cacheControlFor } from '@/seo/cache-control';
import { prefersMarkdown } from '@/seo/markdown/negotiate';
import { normalisePath, renderMarkdown } from '@/seo/markdown/resolve';
import { absoluteUrl, markdownPath } from '@/seo/site';

const canonicalHost = createMiddleware({ type: 'request' }).server(
    async ({ request, next }) => {
        const url = new URL(request.url);
        if (url.hostname.startsWith('www.')) {
            url.hostname = url.hostname.slice('www.'.length);
            return Response.redirect(url.toString(), 308);
        }
        return await next();
    },
);

const markdownTwin = createMiddleware({ type: 'request' }).server(
    async ({ request, next }) => {
        const url = new URL(request.url);
        const wantsMarkdown =
            url.pathname.endsWith('.md') ||
            prefersMarkdown(request.headers.get('accept'));
        if (
            !wantsMarkdown ||
            (request.method !== 'GET' && request.method !== 'HEAD')
        ) {
            return await next();
        }
        const body = await renderMarkdown(getDb(), url);
        if (isNull(body)) {
            // No markdown twin, or the entity does not exist: an explicit
            // `.md` request is a 404, an `Accept` preference just falls back.
            if (!url.pathname.endsWith('.md')) {
                return await next();
            }
            return new Response('Not found\n', {
                headers: { 'content-type': 'text/markdown; charset=utf-8' },
                status: 404,
            });
        }
        const path = normalisePath(url.pathname);
        return new Response(request.method === 'HEAD' ? null : body, {
            headers: {
                'cache-control':
                    cacheControlFor(path, 'markdown') ?? 'public, max-age=300',
                'content-type': 'text/markdown; charset=utf-8',
                link: `<${absoluteUrl(path)}>; rel="canonical"`,
            },
        });
    },
);

const discoveryLinks = createMiddleware({ type: 'request' }).server(
    async ({ request, next }) => {
        // oxlint-disable-next-line node/callback-return -- TanStack middleware: next() is awaited and its result returned on every path, not a Node errback
        const result = await next();
        const url = new URL(request.url);
        if (url.pathname.startsWith('/admin')) {
            return result;
        }
        const path = normalisePath(url.pathname);
        result.response.headers.append(
            'link',
            [
                `<${absoluteUrl(markdownPath(path))}>; rel="alternate"; type="text/markdown"`,
                `<${absoluteUrl('/llms.txt')}>; rel="describedby"; type="text/plain"`,
            ].join(', '),
        );
        return result;
    },
);

const pageCache = createMiddleware({ type: 'request' }).server(
    async ({ request, next }) => {
        // oxlint-disable-next-line node/callback-return -- TanStack middleware: next() is awaited and its result returned on every path, not a Node errback
        const result = await next();
        const path = normalisePath(new URL(request.url).pathname);
        const control = cacheControlFor(path, 'html');
        if (!isUndefined(control)) {
            result.response.headers.set('cache-control', control);
        }
        return result;
    },
);

export const startInstance = createStart(() => ({
    // `discoveryLinks` sits above `markdownTwin` so its headers land on
    // markdown and HTML responses alike.
    requestMiddleware: [canonicalHost, discoveryLinks, pageCache, markdownTwin],
}));
