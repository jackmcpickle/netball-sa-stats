/**
 * Maps a request URL to the markdown twin of the page it names. Returns null
 * when the path has no markdown form, which is the signal to fall through to
 * the normal HTML render rather than to 404.
 *
 * The `.md` suffix is stripped before matching, so `/ladders` (with an
 * `Accept: text/markdown` header) and `/ladders.md` resolve identically.
 */
import { isNull } from 'es-toolkit';
import type { Db } from '@/db';
import {
    renderAbout,
    renderClubIndex,
    renderClubProfile,
    renderHeadToHead,
    renderLadders,
    renderMethod,
    renderRankings,
    renderResults,
} from '@/seo/markdown/pages';
import { createServices } from '@/server/container';
import type { DomainError, Result } from '@/server/domain/result';

/** Strips a trailing `.md` and any trailing slash. `/index.md` means root. */
export function normalisePath(pathname: string): string {
    const withoutSuffix = pathname.endsWith('.md')
        ? pathname.slice(0, -'.md'.length)
        : pathname;
    const trimmed = withoutSuffix.replace(/\/+$/u, '');
    return trimmed === '' || trimmed === '/index' ? '/' : trimmed;
}

function intParam(params: URLSearchParams, key: string): number | undefined {
    const raw = params.get(key);
    if (isNull(raw) || raw.trim() === '') {
        return undefined;
    }
    const value = Number(raw);
    return Number.isInteger(value) ? value : undefined;
}

function stringParam(params: URLSearchParams, key: string): string | undefined {
    const raw = params.get(key);
    return isNull(raw) || raw === '' ? undefined : raw;
}

function dirParam(params: URLSearchParams): 'asc' | 'desc' | undefined {
    const raw = params.get('dir');
    return raw === 'asc' || raw === 'desc' ? raw : undefined;
}

/** The shared table query-string controls every markdown table page accepts. */
interface TableParams {
    readonly sort?: string;
    readonly dir?: 'asc' | 'desc';
    readonly page?: number;
    readonly pageSize?: number;
}

function tableParams(params: URLSearchParams): TableParams {
    return {
        dir: dirParam(params),
        page: intParam(params, 'page'),
        pageSize: intParam(params, 'pageSize'),
        sort: stringParam(params, 'sort'),
    };
}

/** `null` for a not-found entity, so the caller can render a real 404. */
function unwrap<T>(result: Result<T, DomainError>): T | null {
    return result.ok ? result.value : null;
}

function render<T>(
    result: Result<T, DomainError>,
    to: (value: T) => string,
): string | null {
    const value = unwrap(result);
    return isNull(value) ? null : to(value);
}

export async function renderMarkdown(db: Db, url: URL): Promise<string | null> {
    const path = normalisePath(url.pathname);
    const query = url.searchParams;
    const services = createServices(db);

    if (path === '/') {
        return render(
            await services.rankings.getPage({
                season: intParam(query, 'season'),
                ...tableParams(query),
            }),
            renderRankings,
        );
    }
    if (path === '/ladders') {
        return render(
            await services.ladders.getPage({
                grade: stringParam(query, 'grade'),
                year: intParam(query, 'year'),
                ...tableParams(query),
            }),
            renderLadders,
        );
    }
    if (path === '/results') {
        return render(
            await services.results.getPage({
                grade: stringParam(query, 'grade'),
                year: intParam(query, 'year'),
                ...tableParams(query),
            }),
            renderResults,
        );
    }
    if (path === '/clubs') {
        return render(
            await services.clubs.getIndexPage({
                includePast: query.get('includePast') === 'true',
            }),
            renderClubIndex,
        );
    }
    if (path.startsWith('/clubs/')) {
        return render(
            await services.clubs.getProfilePage({
                clubKey: path.slice('/clubs/'.length),
                ...tableParams(query),
            }),
            renderClubProfile,
        );
    }
    if (path === '/head-to-head') {
        const band = query.get('band');
        return render(
            await services.headToHead.getPage({
                a: stringParam(query, 'a'),
                b: stringParam(query, 'b'),
                band: band === 'all' ? 'all' : intParam(query, 'band'),
                includePast: query.get('includePast') === 'true',
                ...tableParams(query),
            }),
            renderHeadToHead,
        );
    }
    if (path === '/about') {
        return renderAbout();
    }
    if (path === '/method') {
        return render(await services.method.getPage(), renderMethod);
    }
    return null;
}

/** Every path that has a markdown twin, for the sitemap and llms.txt. */
export const MARKDOWN_PATHS = [
    '/',
    '/ladders',
    '/results',
    '/clubs',
    '/head-to-head',
    '/method',
    '/about',
] as const;
