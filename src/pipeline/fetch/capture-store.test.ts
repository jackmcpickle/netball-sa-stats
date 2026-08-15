// src/pipeline/fetch/capture-store.test.ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    createFsStore,
    createMemoryStore,
} from '@/pipeline/fetch/capture-store';

describe(createMemoryStore, () => {
    it('returns undefined for a missing key', async () => {
        await expect(
            createMemoryStore().get('gradeLadder_x.json'),
        ).resolves.toBeUndefined();
    });

    it('round-trips put/get and capturedAtMs', async () => {
        const store = createMemoryStore();
        await store.put('gradeLadder_x.json', { data: 1 }, 1_700_000_000_000);
        await expect(store.get('gradeLadder_x.json')).resolves.toStrictEqual({
            data: 1,
        });
        await expect(store.capturedAtMs('gradeLadder_x.json')).resolves.toBe(
            1_700_000_000_000,
        );
    });
});

describe(createFsStore, () => {
    it('round-trips via files and the captured-at manifest', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'capture-store-'));
        const store = createFsStore(dir);
        await store.put('gradeLadder_x.json', { ok: true }, 1_700_000_000_000);
        await expect(store.get('gradeLadder_x.json')).resolves.toStrictEqual({
            ok: true,
        });
        await expect(store.capturedAtMs('gradeLadder_x.json')).resolves.toBe(
            1_700_000_000_000,
        );
    });
});
