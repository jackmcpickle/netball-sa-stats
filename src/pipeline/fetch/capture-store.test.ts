// src/pipeline/fetch/capture-store.test.ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    createFsStore,
    createMemoryStore,
} from '@/pipeline/fetch/capture-store';

describe('createMemoryStore', () => {
    it('returns undefined for a missing key', async () => {
        expect(
            await createMemoryStore().get('gradeLadder_x.json'),
        ).toBeUndefined();
    });

    it('round-trips put/get and capturedAtMs', async () => {
        const store = createMemoryStore();
        await store.put('gradeLadder_x.json', { data: 1 }, 1_700_000_000_000);
        expect(await store.get('gradeLadder_x.json')).toEqual({ data: 1 });
        expect(await store.capturedAtMs('gradeLadder_x.json')).toBe(
            1_700_000_000_000,
        );
    });
});

describe('createFsStore', () => {
    it('round-trips via files and the captured-at manifest', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'capture-store-'));
        const store = createFsStore(dir);
        await store.put('gradeLadder_x.json', { ok: true }, 1_700_000_000_000);
        expect(await store.get('gradeLadder_x.json')).toEqual({ ok: true });
        expect(await store.capturedAtMs('gradeLadder_x.json')).toBe(
            1_700_000_000_000,
        );
    });
});
