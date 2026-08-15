/**
 * Schema.org JSON-LD. Emitted from route `head()` as `application/ld+json`
 * script tags, so it is in the server-rendered HTML rather than injected by
 * client JavaScript an agent may never run.
 */
import { absoluteUrl, SITE } from '@/seo/site';

type Json = Record<string, unknown>;

const ORGANIZATION_ID = `${SITE.origin}/#organization`;
const WEBSITE_ID = `${SITE.origin}/#website`;

export function organizationSchema(): Json {
    return {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: SITE.name,
        url: SITE.origin,
        description: SITE.description,
        logo: absoluteUrl('/icon-512.png'),
        areaServed: {
            '@type': 'AdministrativeArea',
            name: 'South Australia',
        },
        knowsAbout: [
            'Netball',
            'Adelaide Metropolitan Netball Division',
            'Netball SA Premier League',
            'Club championship rankings',
        ],
    };
}

export function webSiteSchema(): Json {
    return {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        name: SITE.name,
        url: SITE.origin,
        description: SITE.description,
        inLanguage: 'en-AU',
        publisher: { '@id': ORGANIZATION_ID },
    };
}

export function webPageSchema(input: {
    readonly name: string;
    readonly description: string;
    readonly path: string;
    /** ISO date the underlying data was last refreshed, when known. */
    readonly dateModified?: string;
}): Json {
    return {
        '@type': 'WebPage',
        '@id': `${absoluteUrl(input.path)}#webpage`,
        url: absoluteUrl(input.path),
        name: input.name,
        description: input.description,
        isPartOf: { '@id': WEBSITE_ID },
        about: { '@id': ORGANIZATION_ID },
        inLanguage: 'en-AU',
        ...(input.dateModified === undefined
            ? {}
            : { dateModified: input.dateModified }),
    };
}

export type FaqEntry = {
    readonly question: string;
    readonly answer: string;
};

export function faqSchema(entries: readonly FaqEntry[]): Json {
    return {
        '@type': 'FAQPage',
        mainEntity: entries.map((entry) => ({
            '@type': 'Question',
            name: entry.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: entry.answer,
            },
        })),
    };
}

export type Crumb = {
    readonly name: string;
    readonly path: string;
};

export function breadcrumbSchema(crumbs: readonly Crumb[]): Json {
    return {
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((crumb, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: crumb.name,
            item: absoluteUrl(crumb.path),
        })),
    };
}

export function datasetSchema(input: {
    readonly name: string;
    readonly description: string;
    readonly path: string;
    readonly temporalCoverage: string;
    readonly dateModified?: string;
}): Json {
    return {
        '@type': 'Dataset',
        '@id': `${absoluteUrl(input.path)}#dataset`,
        name: input.name,
        description: input.description,
        url: absoluteUrl(input.path),
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: { '@id': ORGANIZATION_ID },
        isAccessibleForFree: true,
        temporalCoverage: input.temporalCoverage,
        spatialCoverage: 'South Australia, Australia',
        keywords: ['netball', 'club rankings', 'ladders', 'South Australia'],
        ...(input.dateModified === undefined
            ? {}
            : { dateModified: input.dateModified }),
        distribution: [
            {
                '@type': 'DataDownload',
                encodingFormat: 'text/markdown',
                contentUrl: absoluteUrl('/llms-full.txt'),
            },
        ],
    };
}

/**
 * Wraps graph nodes in a single `@graph` document — one script tag per page
 * keeps the nodes cross-referencable by `@id`.
 */
export function jsonLdGraph(nodes: readonly Json[]): string {
    return JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': nodes,
    });
}

/**
 * A route `head().meta` entry carrying the page's JSON-LD graph. TanStack
 * special-cases the `script:ld+json` key and does the HTML escaping, which
 * hand-rolled `headScripts` children would not.
 */
export function jsonLdMeta(nodes: readonly Json[]): {
    readonly 'script:ld+json': Json;
} {
    return {
        'script:ld+json': {
            '@context': 'https://schema.org',
            '@graph': nodes,
        },
    };
}
