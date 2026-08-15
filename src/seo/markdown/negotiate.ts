/**
 * Content negotiation for the markdown twins. Split from the middleware so it
 * can be tested without pulling in the Cloudflare-only database module.
 */
import { isNull } from 'es-toolkit';

/** True when the client asked for markdown ahead of HTML. */
export function prefersMarkdown(accept: string | null): boolean {
    if (isNull(accept)) {
        return false;
    }
    const markdown = accept.indexOf('text/markdown');
    if (markdown === -1) {
        return false;
    }
    const html = accept.indexOf('text/html');
    return html === -1 || markdown < html;
}
