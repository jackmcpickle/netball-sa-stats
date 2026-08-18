import { describe, expect, it } from 'vitest';
import { cacheControlFor } from '@/seo/cache-control';

describe(cacheControlFor, () => {
    it('gives /faq a week on HTML and markdown', () => {
        expect(cacheControlFor('/faq', 'html')).toBe('public, max-age=604800');
        expect(cacheControlFor('/faq', 'markdown')).toBe(
            'public, max-age=604800',
        );
    });

    it('leaves other HTML pages uncached and markdown at five minutes', () => {
        expect(cacheControlFor('/', 'html')).toBeUndefined();
        expect(cacheControlFor('/clubs/contax', 'html')).toBeUndefined();
        expect(cacheControlFor('/method', 'markdown')).toBe(
            'public, max-age=300',
        );
    });
});
