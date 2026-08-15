// Per-route head tags: title, description, canonical, Open Graph, Twitter.
// Routes call `pageHead()` so every page carries the same complete set and no
// page can quietly ship without a canonical URL.
import { absoluteUrl, markdownPath, SITE } from '@/seo/site';
import {
    jsonLdMeta,
    organizationSchema,
    webPageSchema,
    webSiteSchema,
} from '@/seo/structured-data';

type PageHeadInput = {
    /** Page title without the site suffix. */
    readonly title: string;
    readonly description: string;
    /** Site-relative canonical path, e.g. `/ladders`. */
    readonly path: string;
    /**
     * Schema.org nodes for this page. Always emitted alongside the sitewide
     * Organization and WebSite nodes, so no page ships without structured data.
     */
    readonly schema?: readonly Record<string, unknown>[];
    /** Admin surfaces: keep them out of indexes and out of training data. */
    readonly noIndex?: boolean;
    /** ISO timestamp for the WebPage node, when the page knows one. */
    readonly dateModified?: string;
};

type MetaTag = {
    readonly title?: string;
    readonly name?: string;
    readonly property?: string;
    readonly content?: string;
    readonly 'script:ld+json'?: Record<string, unknown>;
};

type LinkTag = {
    readonly rel: string;
    readonly href: string;
    readonly type?: string;
};

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
}: PageHeadInput): {
    // Mutable arrays: TanStack's `head()` return type is invariant in these.
    readonly meta: MetaTag[];
    readonly links: LinkTag[];
} {
    const url = absoluteUrl(path);
    const full = pageTitle(title);
    if (noIndex) {
        return {
            meta: [
                { title: full },
                { name: 'description', content: description },
                { name: 'robots', content: 'noindex, nofollow' },
            ],
            links: [{ rel: 'canonical', href: url }],
        };
    }
    return {
        meta: [
            { title: full },
            { name: 'description', content: description },
            { property: 'og:type', content: 'website' },
            { property: 'og:site_name', content: SITE.name },
            { property: 'og:locale', content: SITE.locale },
            { property: 'og:title', content: full },
            { property: 'og:description', content: description },
            { property: 'og:url', content: url },
            { property: 'og:image', content: absoluteUrl('/icon-512.png') },
            { name: 'twitter:card', content: 'summary' },
            { name: 'twitter:title', content: full },
            { name: 'twitter:description', content: description },
            { name: 'twitter:image', content: absoluteUrl('/icon-512.png') },
            jsonLdMeta([
                organizationSchema(),
                webSiteSchema(),
                webPageSchema({ name: full, description, path, dateModified }),
                ...schema,
            ]),
        ],
        links: [
            { rel: 'canonical', href: url },
            // The markdown twin, so an agent that parses HTML can find the
            // cheap-to-read version without guessing.
            {
                rel: 'alternate',
                type: 'text/markdown',
                href: absoluteUrl(markdownPath(path)),
            },
        ],
    };
}
