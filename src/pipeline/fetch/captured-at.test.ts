import { mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    capturedAt,
    MANIFEST_NAME,
    recordCapture,
} from '@/pipeline/fetch/captured-at';

async function scratch(): Promise<string> {
    return await mkdtemp(join(tmpdir(), 'captured-at-'));
}

describe(capturedAt, () => {
    it('returns the timestamp recorded when the capture was written', async () => {
        const dir = await scratch();
        const path = join(dir, 'gradeLadder_abc.json');
        await writeFile(path, '{}', 'utf-8');
        await recordCapture(path, 1_700_000_000_000);

        await expect(capturedAt(path)).resolves.toBe(1_700_000_000_000);
    });

    it('survives the file mtime changing, which is the whole point', async () => {
        // Git does not preserve mtimes, so a checkout rewrites every one of
        // them. Deriving scraped_at from mtime made a fetch emit thousands
        // of CSV diffs with no upstream change behind them.
        const dir = await scratch();
        const path = join(dir, 'gradeLadder_abc.json');
        await writeFile(path, '{}', 'utf-8');
        await recordCapture(path, 1_700_000_000_000);

        const later = new Date(1_900_000_000_000);
        await utimes(path, later, later);

        await expect(capturedAt(path)).resolves.toBe(1_700_000_000_000);
    });

    it('adopts the mtime once for a capture predating the manifest', async () => {
        // Existing caches have no manifest entry. The first read takes their
        // mtime and writes it down, so the value is stable from then on.
        const dir = await scratch();
        const path = join(dir, 'legacy.json');
        await writeFile(path, '{}', 'utf-8');
        const when = new Date(1_650_000_000_000);
        await utimes(path, when, when);

        const first = await capturedAt(path);
        expect(first).toBe(1_650_000_000_000);

        const later = new Date(1_990_000_000_000);
        await utimes(path, later, later);
        await expect(capturedAt(path)).resolves.toBe(first);
    });

    it('keeps one manifest per directory, keyed by file name', async () => {
        const dir = await scratch();
        const path = join(dir, 'gradeLadder_abc.json');
        await writeFile(path, '{}', 'utf-8');
        await recordCapture(path, 1_700_000_000_000);

        const manifest = JSON.parse(
            await readFile(join(dir, MANIFEST_NAME), 'utf-8'),
        ) as Record<string, number>;
        expect(manifest).toStrictEqual({
            'gradeLadder_abc.json': 1_700_000_000_000,
        });
    });

    it('does not lose an existing entry when another capture is recorded', async () => {
        const dir = await scratch();
        for (const name of ['a.json', 'b.json']) {
            // eslint-disable-next-line no-await-in-loop -- recorded in order on purpose
            await writeFile(join(dir, name), '{}', 'utf-8');
        }
        await recordCapture(join(dir, 'a.json'), 1);
        await recordCapture(join(dir, 'b.json'), 2);

        await expect(capturedAt(join(dir, 'a.json'))).resolves.toBe(1);
        await expect(capturedAt(join(dir, 'b.json'))).resolves.toBe(2);
    });

    it('overwrites the entry when a capture is refetched', async () => {
        const dir = await scratch();
        const path = join(dir, 'a.json');
        await writeFile(path, '{}', 'utf-8');
        await recordCapture(path, 1);
        await recordCapture(path, 2);

        await expect(capturedAt(path)).resolves.toBe(2);
    });
});
