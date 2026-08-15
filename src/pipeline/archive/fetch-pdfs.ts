import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ARCHIVE_PDF_SOURCES } from './sources.ts';
import type { ArchivePdfSource } from './sources.ts';

export interface FetchArchivePdfsOptions {
    rawDir: string;
    sources?: readonly ArchivePdfSource[];
    fetchImpl?: typeof fetch;
    delayMs?: number;
    userAgent?: string;
}

export interface FetchedArchivePdf {
    year: number;
    path: string;
    status: 'downloaded' | 'skipped';
}

const DEFAULT_USER_AGENT =
    'netball-stats archive-pdf-backfill (+https://github.com/)';

async function fileExistsWithContent(path: string): Promise<boolean> {
    try {
        const info = await stat(path);
        return info.isFile() && info.size > 0;
    } catch (error) {
        if (
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
        ) {
            return false;
        }
        throw error;
    }
}

async function sleep(ms: number): Promise<void> {
    // oxlint-disable-next-line promise/avoid-new, promise/param-names -- promisifying `setTimeout`, a callback timer API with no promise form.
    await new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

function assertPdf(bytes: Uint8Array, source: ArchivePdfSource): void {
    const header = new TextDecoder('ascii').decode(bytes.slice(0, 5));
    if (header !== '%PDF-') {
        throw new Error(
            `Archive fetch for ${String(source.year)} did not return a PDF from ${source.waybackUrl}`,
        );
    }
}

export async function fetchArchivePdfs(
    options: FetchArchivePdfsOptions,
): Promise<FetchedArchivePdf[]> {
    const sources = options.sources ?? ARCHIVE_PDF_SOURCES;
    const fetchImpl = options.fetchImpl ?? fetch;
    const delayMs = options.delayMs ?? 1000;
    const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    await mkdir(options.rawDir, { recursive: true });

    const fetched: FetchedArchivePdf[] = [];
    let attemptedDownload = false;
    for (const source of sources) {
        const path = join(options.rawDir, source.rawFilename);
        // eslint-disable-next-line no-await-in-loop -- serial checks/downloads enforce the 1 req/s Wayback limit
        if (await fileExistsWithContent(path)) {
            fetched.push({ year: source.year, path, status: 'skipped' });
            continue;
        }

        if (attemptedDownload && delayMs > 0) {
            // eslint-disable-next-line no-await-in-loop -- deliberate 1 req/s throttle between archive.org requests
            await sleep(delayMs);
        }
        attemptedDownload = true;

        // eslint-disable-next-line no-await-in-loop -- downloads are intentionally sequential for archive.org politeness
        const response = await fetchImpl(source.waybackUrl, {
            headers: { 'user-agent': userAgent },
        });
        if (!response.ok) {
            throw new Error(
                `Archive fetch for ${String(source.year)} failed: HTTP ${String(response.status)} ${response.statusText}`,
            );
        }

        // eslint-disable-next-line no-await-in-loop -- downloads are intentionally sequential for archive.org politeness
        const bytes = new Uint8Array(await response.arrayBuffer());
        assertPdf(bytes, source);
        // eslint-disable-next-line no-await-in-loop -- writes stay paired with the serial download they persist
        await writeFile(path, bytes);
        fetched.push({ year: source.year, path, status: 'downloaded' });
    }

    return fetched;
}
