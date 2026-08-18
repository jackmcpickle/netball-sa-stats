/**
 * Bodies for the agent-facing discovery files. Pure string builders, so the
 * route handlers stay trivial and every file is directly testable.
 */
import { absoluteUrl, SITE } from '@/seo/site';

/**
 * AI crawlers are allowed by name as well as by the wildcard: several of them
 * only honour an explicit `User-agent` block, and the point of this file is
 * that the site *wants* to be read and cited.
 */
const AI_AGENTS = [
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Claude-User',
    'Claude-SearchBot',
    'anthropic-ai',
    'PerplexityBot',
    'Perplexity-User',
    'Google-Extended',
    'Applebot-Extended',
    'Bingbot',
    'CCBot',
    'Meta-ExternalAgent',
    'cohere-ai',
    'DuckAssistBot',
] as const;

export function robotsTxt(): string {
    const blocks = ['*', ...AI_AGENTS].map((agent) =>
        [`User-agent: ${agent}`, 'Allow: /', 'Disallow: /admin'].join('\n'),
    );
    return [
        '# Netball Open Data is open data: crawl it, quote it, cite it.',
        '# Content-Signal declares how this content may be used.',
        'Content-Signal: search=yes, ai-input=yes, ai-train=yes',
        '',
        blocks.join('\n\n'),
        '',
        `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
        '',
    ].join('\n');
}

export interface SitemapEntry {
    readonly path: string;
    readonly changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
    readonly priority: string;
}

export function sitemapXml(
    entries: readonly SitemapEntry[],
    lastmod: string,
): string {
    const urls = entries.map((entry) =>
        [
            '    <url>',
            `        <loc>${absoluteUrl(entry.path)}</loc>`,
            `        <lastmod>${lastmod}</lastmod>`,
            `        <changefreq>${entry.changefreq}</changefreq>`,
            `        <priority>${entry.priority}</priority>`,
            '    </url>',
        ].join('\n'),
    );
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls,
        '</urlset>',
        '',
    ].join('\n');
}

export interface LlmsTxtInput {
    /** Ranked years, ascending. */
    readonly rankedYears: readonly number[];
    readonly competitions: readonly string[];
    readonly clubs: readonly { readonly key: string; readonly name: string }[];
    readonly isSampleData: boolean;
}

/** The llmstxt.org shape: H1, blockquote summary, then linked H2 sections. */
export function llmsTxt(input: LlmsTxtInput): string {
    const span =
        input.rankedYears.length === 0
            ? 'no ranked seasons yet'
            : `${Math.min(...input.rankedYears)}–${Math.max(...input.rankedYears)}`;
    const clubLinks = input.clubs.map((club) => {
        const href = absoluteUrl(`/clubs/${club.key}.md`);
        return `- [${club.name}](${href})`;
    });
    return [
        `# ${SITE.name}`,
        '',
        `> ${SITE.description} Covers ${input.competitions.join(', ')} across ranked seasons ${span}. Every page is also served as markdown: append \`.md\` to any URL, or send \`Accept: text/markdown\`.`,
        '',
        input.isSampleData
            ? '> **Note:** the site is currently serving generated sample figures, not real results.\n'
            : '',
        '## Pages',
        '',
        `- [Club championship rankings](${absoluteUrl('/index.md')}): one weighted score per club per season, the site's headline table.`,
        `- [Method](${absoluteUrl('/method.md')}): how the score is built, the grade weight table, and the documented limits of the data.`,
        `- [FAQ](${absoluteUrl('/faq.md')}): common questions about the championship, coverage and fixture results.`,
        `- [Ladders](${absoluteUrl('/ladders.md')}): full grade ladders — position, played, won, lost, goals, percentage.`,
        `- [Clubs](${absoluteUrl('/clubs.md')}): club index with championship totals; each club has its own page.`,
        `- [Results](${absoluteUrl('/results.md')}): fixture-level results, 2025 onwards.`,
        `- [Head to head](${absoluteUrl('/head-to-head.md')}): records between any two clubs, 2025 onwards.`,
        '',
        '## Query parameters',
        '',
        '- `/ladders.md?year=YYYY&grade=GRADE_KEY`',
        '- `/results.md?year=YYYY&grade=GRADE_KEY`',
        '- `/index.md?season=YYYY`',
        '- `/head-to-head.md?a=CLUB_KEY&b=CLUB_KEY`',
        '- `/clubs.md?includePast=true`',
        '',
        '## Clubs',
        '',
        ...clubLinks,
        '',
        '## Optional',
        '',
        `- [Full text](${absoluteUrl('/llms-full.txt')}): every core page concatenated as one markdown document.`,
        '',
    ].join('\n');
}

/** `llms-full.txt` is the core pages, in reading order, one document. */
export function llmsFullTxt(documents: readonly string[]): string {
    return documents.join('\n\n---\n\n');
}
