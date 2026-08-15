import { describe, expect, it } from 'vitest';
import { prefersMarkdown } from '@/seo/markdown/negotiate';

describe(prefersMarkdown, () => {
    it.each([
        ['text/markdown', true],
        ['text/markdown, text/html;q=0.9', true],
        ['text/markdown;q=1.0,*/*;q=0.1', true],
        ['text/html, text/markdown', false],
        ['text/html,application/xhtml+xml', false],
        ['*/*', false],
        ['', false],
    ])('reads %s as %s', (accept, expected) => {
        expect(prefersMarkdown(accept)).toBe(expected);
    });

    it('treats a missing header as a browser request', () => {
        expect(prefersMarkdown(null)).toBeFalsy();
    });
});
