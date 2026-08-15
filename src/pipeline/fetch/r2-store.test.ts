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
            // SAFETY: `hit.body` was produced by `JSON.stringify` in this
            // class's own `put`; widening `JSON.parse`'s `any` back to
            // `unknown` matches `R2ObjectBody.json`'s contract.
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

/**
 * `MemoryR2` implements only the three members `createR2Store` calls
 * (`get`/`head`/`put`), so it cannot structurally satisfy the full `R2Bucket`
 * interface. This is the one place that gap is bridged.
 */
function storeOf(bucket: MemoryR2): CaptureStore {
    // SAFETY: `createR2Store` reads exactly `get`, `head` and `put`, and
    // `MemoryR2` declares all three with matching signatures — checked by the
    // class's own type annotations directly above.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- a hand-rolled double for a Cloudflare runtime interface: there is no narrower type to keep.
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
