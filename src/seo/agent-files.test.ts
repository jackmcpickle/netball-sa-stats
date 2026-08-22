import { describe, expect, it } from 'vitest';
import { llmsFullTxt, llmsTxt, robotsTxt, sitemapXml } from '@/seo/agent-files';
import { buildSitemapEntries } from '@/seo/sitemap';

describe(robotsTxt, () => {
    const body = robotsTxt();

    it.each([
        'GPTBot',
        'ClaudeBot',
        'PerplexityBot',
        'Google-Extended',
        'CCBot',
    ])('allows %s by name', (agent) => {
        expect(body).toContain(`User-agent: ${agent}\nAllow: /`);
    });

    it('declares content signals', () => {
        expect(body).toContain(
            'Content-Signal: search=yes, ai-input=yes, ai-train=yes',
        );
    });

    it('keeps admin out and points at the sitemap', () => {
        expect(body).toContain('Disallow: /admin');
        expect(body).toContain('Sitemap: https://netballsa.com/sitemap.xml');
    });

    it('never disallows the whole site', () => {
        expect(body).not.toContain('Disallow: /\n');
    });
});

describe(sitemapXml, () => {
    it('emits absolute loc entries for pages and clubs', () => {
        const xml = sitemapXml(
            buildSitemapEntries(['contax', 'garville']),
            '2026-08-15',
        );
        expect(
            xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
        ).toBeTruthy();
        expect(xml).toContain('<loc>https://netballsa.com/</loc>');
        expect(xml).toContain('<loc>https://netballsa.com/method</loc>');
        expect(xml).toContain('<loc>https://netballsa.com/about</loc>');
        expect(xml).toContain('<loc>https://netballsa.com/faq</loc>');
        expect(xml).toContain('<loc>https://netballsa.com/leagues</loc>');
        expect(xml).toContain('<loc>https://netballsa.com/clubs/contax</loc>');
    });

    it('wraps the entries in a well-formed urlset with a lastmod', () => {
        const xml = sitemapXml(
            buildSitemapEntries(['contax', 'garville']),
            '2026-08-15',
        );
        expect(xml).toContain('<lastmod>2026-08-15</lastmod>');
        expect(xml.trimEnd().endsWith('</urlset>')).toBeTruthy();
    });

    it('never emits a relative loc', () => {
        const xml = sitemapXml(buildSitemapEntries([]), '2026-08-15');
        expect(xml).not.toMatch(/<loc>(?!https:\/\/)/u);
    });
});

describe(llmsTxt, () => {
    const body = llmsTxt({
        clubs: [{ key: 'contax', name: 'Contax' }],
        competitions: ['AMND', 'Netball SA Premier League'],
        isSampleData: false,
        rankedYears: [2000, 2024, 2025],
    });

    it('follows the llmstxt.org shape', () => {
        expect(body.startsWith('# Netball Open Data')).toBeTruthy();
        expect(body).toMatch(/\n> /u);
        expect(body).toContain('## Pages');
        expect(body).toContain('## Optional');
    });

    it('links the markdown twins, not the HTML pages', () => {
        expect(body).toContain('https://netballsa.com/method.md');
        expect(body).toContain('https://netballsa.com/index.md');
        expect(body).toContain('https://netballsa.com/clubs/contax.md');
        expect(body).toContain('https://netballsa.com/faq.md');
    });

    it('states the covered span from the ranked years', () => {
        expect(body).toContain('2000–2025');
    });

    it('flags sample data when the dataset is synthetic', () => {
        const sample = llmsTxt({
            clubs: [],
            competitions: ['AMND'],
            isSampleData: true,
            rankedYears: [2025],
        });
        expect(sample).toContain('sample figures');
    });
});

describe(llmsFullTxt, () => {
    it('joins documents with a horizontal rule', () => {
        expect(llmsFullTxt(['# A', '# B'])).toBe('# A\n\n---\n\n# B');
    });
});
