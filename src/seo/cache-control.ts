const WEEK = 'public, max-age=604800';
const MARKDOWN = 'public, max-age=300';

export function cacheControlFor(
    path: string,
    kind: 'html' | 'markdown',
): string | undefined {
    if (path === '/faq') {
        return WEEK;
    }
    if (kind === 'markdown') {
        return MARKDOWN;
    }
    return undefined;
}
