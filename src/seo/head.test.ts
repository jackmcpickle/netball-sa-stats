import { isUndefined } from 'es-toolkit';
/**
 * Head tags are a response type too: a missing canonical or a malformed
 * JSON-LD graph is invisible in the browser and fatal to a crawler.
 */
import { describe, expect, it } from 'vitest';
import type { MetaTag } from '@/seo/head';
import { pageHead, pageTitle } from '@/seo/head';
import type { JsonLdNode } from '@/seo/structured-data';
import { faqSchema } from '@/seo/structured-data';

function contentOf(
    meta: readonly MetaTag[],
    key: 'name' | 'property',
    value: string,
): string | undefined {
    return meta.find((tag) => tag[key] === value)?.content;
}

function graphOf(meta: readonly MetaTag[]): readonly JsonLdNode[] {
    const node = meta.find((tag) => !isUndefined(tag['script:ld+json']));
    const graph = node?.['script:ld+json']?.['@graph'];
    if (isUndefined(graph)) {
        throw new Error('head() emitted no JSON-LD @graph');
    }
    return graph;
}

const PATHS = [
    '/',
    '/ladders',
    '/results',
    '/clubs',
    '/clubs/contax',
    '/head-to-head',
    '/method',
    '/about',
];

describe(pageHead, () => {
    it.each(PATHS)('gives %s a complete, absolute head', (path) => {
        const head = pageHead({
            title: 'Page',
            description: 'A description of the page.',
            path,
        });
        const canonical = head.links.find((link) => link.rel === 'canonical');
        expect(canonical?.href).toBe(`https://netballsa.com${path}`);
        expect(contentOf(head.meta, 'name', 'description')).toBe(
            'A description of the page.',
        );
        expect(contentOf(head.meta, 'property', 'og:title')).toBe(
            'Page — Netball Open Data',
        );
        expect(contentOf(head.meta, 'property', 'og:description')).toBe(
            'A description of the page.',
        );
    });

    it.each(PATHS)('gives %s complete Open Graph and Twitter cards', (path) => {
        const head = pageHead({
            title: 'Page',
            description: 'A description of the page.',
            path,
        });
        expect(contentOf(head.meta, 'property', 'og:url')).toBe(
            `https://netballsa.com${path}`,
        );
        expect(contentOf(head.meta, 'name', 'twitter:card')).toBe('summary');
    });

    it('advertises the markdown twin, with /index.md for the root', () => {
        const root = pageHead({ title: 'Home', description: 'x', path: '/' });
        expect(
            root.links.find((link) => link.rel === 'alternate'),
        ).toStrictEqual({
            rel: 'alternate',
            type: 'text/markdown',
            href: 'https://netballsa.com/index.md',
        });
        const method = pageHead({
            title: 'Method',
            description: 'x',
            path: '/method',
        });
        expect(
            method.links.find((link) => link.rel === 'alternate')?.href,
        ).toBe('https://netballsa.com/method.md');
    });

    it('always emits Organization, WebSite and WebPage nodes', () => {
        const graph = graphOf(
            pageHead({ title: 'Page', description: 'x', path: '/ladders' })
                .meta,
        );
        expect(graph.map((node) => node['@type'])).toStrictEqual([
            'Organization',
            'WebSite',
            'WebPage',
        ]);
    });

    it('appends page-specific schema after the sitewide nodes', () => {
        const graph = graphOf(
            pageHead({
                title: 'Method',
                description: 'x',
                path: '/method',
                schema: [faqSchema([{ question: 'Why?', answer: 'Because.' }])],
            }).meta,
        );
        const faq = graph.at(-1);
        expect(faq?.['@type']).toBe('FAQPage');
        expect(JSON.stringify(faq)).toContain('Because.');
    });

    it('carries dateModified onto the WebPage node when given', () => {
        const graph = graphOf(
            pageHead({
                title: 'Method',
                description: 'x',
                path: '/method',
                dateModified: '2026-08-01T00:00:00.000Z',
            }).meta,
        );
        expect(graph[2]?.dateModified).toBe('2026-08-01T00:00:00.000Z');
    });

    it('produces JSON-LD that round-trips through JSON', () => {
        const node = pageHead({
            title: 'Page',
            description: 'x',
            path: '/',
        }).meta.find((tag) => !isUndefined(tag['script:ld+json']));
        const parsed = structuredClone(node?.['script:ld+json']);
        expect(parsed?.['@context']).toBe('https://schema.org');
    });

    it('marks admin pages noindex and emits no structured data', () => {
        const head = pageHead({
            title: 'Admin',
            description: 'x',
            path: '/admin',
            noIndex: true,
        });
        expect(contentOf(head.meta, 'name', 'robots')).toBe(
            'noindex, nofollow',
        );
        expect(
            head.meta.some((tag) => !isUndefined(tag['script:ld+json'])),
        ).toBeFalsy();
        expect(head.links.some((link) => link.rel === 'alternate')).toBeFalsy();
    });
});

describe(pageTitle, () => {
    it('uses the tagline for the site title and suffixes the rest', () => {
        expect(pageTitle('Netball Open Data')).toBe(
            'Netball Open Data — South Australian netball club rankings',
        );
        expect(pageTitle('Ladders')).toBe('Ladders — Netball Open Data');
    });
});
