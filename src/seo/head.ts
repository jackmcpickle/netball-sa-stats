// Per-route head tags: title, description, canonical, Open Graph, Twitter.
// Routes call `pageHead()` so every page carries the same complete set and no
// page can quietly ship without a canonical URL.
import { absoluteUrl, markdownPath, SITE } from '@/seo/site';
import type { JsonLdDocument, JsonLdNode } from '@/seo/structured-data';
import {
    jsonLdMeta,
    organizationSchema,
    webPageSchema,
    webSiteSchema,
} from '@/seo/structured-data';

interface PageHeadInput {
    /** Page title without the site suffix. */
    readonly title: string;
    readonly description: string;
    /** Site-relative canonical path, e.g. `/ladders`. */
    readonly path: string;
    /**
     * Schema.org nodes for this page. Always emitted alongside the sitewide
     * Organization and WebSite nodes, so no page ships without structured data.
     */
    readonly schema?: readonly JsonLdNode[];
    /** Admin surfaces: keep them out of indexes and out of training data. */
    readonly noIndex?: boolean;
    /** ISO timestamp for the WebPage node, when the page knows one. */
    readonly dateModified?: string;
}

export interface MetaTag {
    readonly title?: string;
    readonly name?: string;
    readonly property?: string;
    readonly content?: string;
    readonly 'script:ld+json'?: JsonLdDocument;
}

/** The subset of TanStack's `head()` return this module produces. */
interface PageHead {
    // Mutable arrays: TanStack's `head()` return type is invariant in these.
    readonly meta: MetaTag[];
    readonly links: LinkTag[];
}

export interface LinkTag {
    readonly rel: string;
    readonly href: string;
    readonly type?: string;
}

export function pageTitle(title: string): string {
    return title === SITE.name
        ? `${SITE.name} — ${SITE.tagline}`
        : `${title} — ${SITE.name}`;
}

export function pageHead({
    title,
    description,
    path,
    schema = [],
    noIndex = false,
    dateModified,
}: PageHeadInput): PageHead {
    const url = absoluteUrl(path);
    const full = pageTitle(title);
    if (noIndex) {
        return {
            links: [{ href: url, rel: 'canonical' }],
            meta: [
                { title: full },
                { content: description, name: 'description' },
                { content: 'noindex, nofollow', name: 'robots' },
            ],
        };
    }
    return {
        links: [
            { href: url, rel: 'canonical' },
            // The markdown twin, so an agent that parses HTML can find the
            // cheap-to-read version without guessing.
            {
                href: absoluteUrl(markdownPath(path)),
                rel: 'alternate',
                type: 'text/markdown',
            },
        ],
        meta: [
            { title: full },
            { content: description, name: 'description' },
            { content: 'website', property: 'og:type' },
            { content: SITE.name, property: 'og:site_name' },
            { content: SITE.locale, property: 'og:locale' },
            { content: full, property: 'og:title' },
            { content: description, property: 'og:description' },
            { content: url, property: 'og:url' },
            { content: absoluteUrl('/icon-512.png'), property: 'og:image' },
            { content: 'summary', name: 'twitter:card' },
            { content: full, name: 'twitter:title' },
            { content: description, name: 'twitter:description' },
            { content: absoluteUrl('/icon-512.png'), name: 'twitter:image' },
            jsonLdMeta([
                organizationSchema(),
                webSiteSchema(),
                webPageSchema({ dateModified, description, name: full, path }),
                ...schema,
            ]),
        ],
    };
}
