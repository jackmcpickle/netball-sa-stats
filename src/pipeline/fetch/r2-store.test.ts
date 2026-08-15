import { describe, expect, it } from 'vitest';
import type { CaptureStore } from '@/pipeline/fetch/capture-store';
import { createR2Store } from '@/pipeline/fetch/r2-store';

class MemoryR2 {
    private readonly map = new Map<
        string,
        { body: string; capturedAtMs: string }
    >();
    public getCalls = 0;
    public async get(key: string): Promise<{
        json: () => Promise<unknown>;
        customMetadata: { capturedAtMs: string };
    } | null> {
        this.getCalls += 1;
        const hit = this.map.get(key);
        if (!hit) {
            return null;
        }
        return {
            json: async () => JSON.parse(hit.body) as unknown,
            customMetadata: { capturedAtMs: hit.capturedAtMs },
        };
    }
    public async head(
        key: string,
    ): Promise<{ customMetadata: { capturedAtMs: string } } | null> {
        const hit = this.map.get(key);
        if (!hit) {
            return null;
        }
        return { customMetadata: { capturedAtMs: hit.capturedAtMs } };
    }

    public async put(
        key: string,
        value: string,
        opts?: { customMetadata?: Record<string, string> },
    ): Promise<void> {
        this.map.set(key, {
            body: value,
            capturedAtMs: opts?.customMetadata?.capturedAtMs ?? '0',
        });
    }

    public hasRawKey(key: string): boolean {
        return this.map.has(`raw/${key}`);
    }
}

function storeOf(bucket: MemoryR2): CaptureStore {
    return createR2Store(bucket as unknown as R2Bucket);
}

describe(createR2Store, () => {
    it('returns undefined for a missing key', async () => {
        await expect(
            storeOf(new MemoryR2()).get('gradeLadder_x.json'),
        ).resolves.toBeUndefined();
    });

    it('round-trips put/get and capturedAtMs under raw/', async () => {
        const bucket = new MemoryR2();
        const store = storeOf(bucket);
        await store.put('gradeLadder_x.json', { data: 1 }, 1_700_000_000_000);
        await expect(store.get('gradeLadder_x.json')).resolves.toStrictEqual({
            data: 1,
        });
        await expect(store.capturedAtMs('gradeLadder_x.json')).resolves.toBe(
            1_700_000_000_000,
        );
        expect(bucket.hasRawKey('gradeLadder_x.json')).toBeTruthy();
    });

    it('returns undefined capturedAtMs for a missing key', async () => {
        await expect(
            storeOf(new MemoryR2()).capturedAtMs('gradeLadder_x.json'),
        ).resolves.toBeUndefined();
    });

    it('reads capturedAtMs from head, without downloading the body', async () => {
        const bucket = new MemoryR2();
        const store = storeOf(bucket);
        await store.put('gradeLadder_x.json', { data: 1 }, 1_700_000_000_000);
        await store.capturedAtMs('gradeLadder_x.json');
        expect(bucket.getCalls).toBe(0);
    });
});
