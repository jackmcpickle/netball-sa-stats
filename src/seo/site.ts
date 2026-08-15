/**
 * Site-wide identity used by head tags, structured data, and the agent-facing
 * files (robots.txt, sitemap.xml, llms.txt). One source so a domain change is
 * a one-line edit.
 */
export const SITE = {
    /** Canonical origin. `www` redirects here — see the request middleware. */
    origin: 'https://netballsa.com',
    name: 'Netball Open Data',
    tagline: 'South Australian netball club rankings',
    description:
        'Ladder finishes across every grade and season, weighted by grade and added up into a single club championship score for South Australian netball.',
    locale: 'en_AU',
} as const;

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path: string): string {
    return new URL(path, SITE.origin).href;
}

/**
 * The markdown twin of a page path. The root has no name to suffix, so it
 * gets `/index.md`.
 */
export function markdownPath(path: string): string {
    const trimmed = path.replace(/\/+$/u, '');
    return trimmed === '' ? '/index.md' : `${trimmed}.md`;
}
