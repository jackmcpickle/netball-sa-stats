/**
 * When each raw capture under `data/raw/` was actually fetched.
 *
 * `scraped_at` used to be the cache file's mtime. Git does not preserve
 * mtimes, so every `git checkout` rewrote them, and the next fetch then
 * emitted thousands of CSV diffs with no upstream change behind them — the
 * previous fix was to `git checkout --` the CSVs back by hand after every
 * run. Recording the capture time alongside the payload makes it a property
 * of the data rather than of the filesystem, so a cache-only re-run
 * reproduces byte-identical CSVs no matter how the files got onto disk.
 *
 * One manifest per directory, keyed by file name, committed with the
 * captures it describes.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { isNull } from 'es-toolkit';

export const MANIFEST_NAME = 'captured-at.json';

type Manifest = Record<string, number>;

function manifestPath(cachePath: string): string {
    return join(dirname(cachePath), MANIFEST_NAME);
}

async function readManifest(cachePath: string): Promise<Manifest> {
    try {
        const text = await readFile(manifestPath(cachePath), 'utf-8');
        const parsed: unknown = JSON.parse(text);
        // SAFETY: narrowed to a non-null object on the line above; `Manifest`
        // is an open `Record<string, number>` and every read of it re-checks
        // `typeof recorded === 'number'` (see `capturedAt`), so a manifest
        // with unexpected values degrades to "no recorded timestamp".
        return typeof parsed === 'object' && !isNull(parsed)
            ? (parsed as Manifest)
            : {};
    } catch {
        return {};
    }
}

/**
 * Read-modify-write, which is safe here only because fetching is sequential
 * by design — PlayHQ etiquette caps the run at roughly one request a second.
 */
async function writeManifest(
    cachePath: string,
    manifest: Manifest,
): Promise<void> {
    const sorted = Object.fromEntries(
        Object.entries(manifest).toSorted(([left], [right]) =>
            left.localeCompare(right),
        ),
    );
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(
        manifestPath(cachePath),
        `${JSON.stringify(sorted, null, 4)}\n`,
        'utf-8',
    );
}

/** Records when a capture was fetched. Called on every cache write. */
export async function recordCapture(
    cachePath: string,
    when: number,
): Promise<void> {
    const manifest = await readManifest(cachePath);
    manifest[basename(cachePath)] = when;
    await writeManifest(cachePath, manifest);
}

/**
 * When this capture was fetched. A capture predating the manifest has no
 * entry, so its mtime is adopted once and written down — after which the
 * value no longer moves, whatever happens to the file.
 */
export async function capturedAt(cachePath: string): Promise<number> {
    const manifest = await readManifest(cachePath);
    const recorded = manifest[basename(cachePath)];
    if (typeof recorded === 'number') {
        return recorded;
    }
    const stats = await stat(cachePath);
    const adopted = Math.floor(stats.mtimeMs);
    await recordCapture(cachePath, adopted);
    return adopted;
}
