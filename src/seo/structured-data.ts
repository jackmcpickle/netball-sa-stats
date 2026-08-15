/**
 * Schema.org JSON-LD. Emitted from route `head()` as `application/ld+json`
 * script tags, so it is in the server-rendered HTML rather than injected by
 * client JavaScript an agent may never run.
 */
/* oxlint-disable typescript/explicit-function-return-type -- the node builders keep inference and validate with `satisfies JsonLdNode`; an explicit dictionary return type instead trips anti-slop/no-known-value-widening */
/* oxlint-disable typescript/explicit-module-boundary-types -- same reason: the inferred literal shape is the contract these builders publish */
import { absoluteUrl, SITE } from '@/seo/site';

/**
 * A JSON-LD value. `undefined` is permitted so optional members can be written
 * inline: `JSON.stringify` drops those keys, matching the JSON-LD contract.
 */
type JsonLdValue =
    | string
    | number
    | boolean
    | undefined
    | readonly JsonLdValue[]
    | JsonLdNode;

/** A JSON-LD node object. */
export interface JsonLdNode {
    readonly [key: string]: JsonLdValue;
}

/** A whole JSON-LD document: one `@graph` of cross-referencable nodes. */
export interface JsonLdDocument {
    readonly '@context': string;
    readonly '@graph': readonly JsonLdNode[];
}

/** A route `head().meta` entry carrying a JSON-LD document. */
export interface JsonLdMetaTag {
    readonly 'script:ld+json': JsonLdDocument;
}

const ORGANIZATION_ID = `${SITE.origin}/#organization`;
const WEBSITE_ID = `${SITE.origin}/#website`;

export function organizationSchema() {
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
    } satisfies JsonLdNode;
}

export function webSiteSchema() {
    return {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        name: SITE.name,
        url: SITE.origin,
        description: SITE.description,
        inLanguage: 'en-AU',
        publisher: { '@id': ORGANIZATION_ID },
    } satisfies JsonLdNode;
}

export function webPageSchema(input: {
    readonly name: string;
    readonly description: string;
    readonly path: string;
    /** ISO date the underlying data was last refreshed, when known. */
    readonly dateModified?: string;
}) {
    return {
        '@type': 'WebPage',
        '@id': `${absoluteUrl(input.path)}#webpage`,
        url: absoluteUrl(input.path),
        name: input.name,
        description: input.description,
        isPartOf: { '@id': WEBSITE_ID },
        about: { '@id': ORGANIZATION_ID },
        inLanguage: 'en-AU',
        dateModified: input.dateModified,
    } satisfies JsonLdNode;
}

export interface FaqEntry {
    readonly question: string;
    readonly answer: string;
}

export function faqSchema(entries: readonly FaqEntry[]) {
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
    } satisfies JsonLdNode;
}

export interface Crumb {
    readonly name: string;
    readonly path: string;
}

export function breadcrumbSchema(crumbs: readonly Crumb[]) {
    return {
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((crumb, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: crumb.name,
            item: absoluteUrl(crumb.path),
        })),
    } satisfies JsonLdNode;
}

export function datasetSchema(input: {
    readonly name: string;
    readonly description: string;
    readonly path: string;
    readonly temporalCoverage: string;
    readonly dateModified?: string;
}) {
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
        dateModified: input.dateModified,
        distribution: [
            {
                '@type': 'DataDownload',
                encodingFormat: 'text/markdown',
                contentUrl: absoluteUrl('/llms-full.txt'),
            },
        ],
    } satisfies JsonLdNode;
}

/**
 * Wraps graph nodes in a single `@graph` document — one script tag per page
 * keeps the nodes cross-referencable by `@id`.
 */
export function jsonLdGraph(nodes: readonly JsonLdNode[]): string {
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
export function jsonLdMeta(nodes: readonly JsonLdNode[]): JsonLdMetaTag {
    return {
        'script:ld+json': {
            '@context': 'https://schema.org',
            '@graph': nodes,
        },
    };
}
