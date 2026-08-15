import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { capturedAt, recordCapture } from '@/pipeline/fetch/captured-at';

export type CaptureStore = {
    // Brief API: undefined means a cache miss; `unknown` is the stored payload.
    // oxlint-disable-next-line typescript/no-redundant-type-constituents -- explicit miss vs payload
    get(key: string): Promise<unknown | undefined>;
    put(key: string, data: unknown, capturedAtMs: number): Promise<void>;
    capturedAtMs(key: string): Promise<number | undefined>;
};

export function createMemoryStore(
    seed?: ReadonlyMap<string, { data: unknown; capturedAtMs: number }>,
): CaptureStore {
    const entries = new Map(seed);
    return {
        async get(key) {
            return entries.get(key)?.data;
        },
        async put(key, data, capturedAtMs) {
            entries.set(key, { data, capturedAtMs });
        },
        async capturedAtMs(key) {
            return entries.get(key)?.capturedAtMs;
        },
    };
}

export function createFsStore(rawDir: string): CaptureStore {
    function filePath(key: string): string {
        return join(rawDir, key);
    }

    return {
        async get(key) {
            try {
                const text = await readFile(filePath(key), 'utf-8');
                return JSON.parse(text) as unknown;
            } catch {
                return;
            }
        },
        async put(key, data, capturedAtMs) {
            const path = filePath(key);
            await mkdir(rawDir, { recursive: true });
            await writeFile(
                path,
                `${JSON.stringify(data, null, 4)}\n`,
                'utf-8',
            );
            await recordCapture(path, capturedAtMs);
        },
        async capturedAtMs(key) {
            const recorded = await capturedAt(filePath(key));
            return recorded;
        },
    };
}
