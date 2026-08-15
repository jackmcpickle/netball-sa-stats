import type { CaptureStore } from '@/pipeline/fetch/capture-store';

function rawKey(key: string): string {
    return `raw/${key}`;
}

export function createR2Store(bucket: R2Bucket): CaptureStore {
    return {
        async get(key) {
            const object = await bucket.get(rawKey(key));
            if (object === null) {
                return undefined;
            }
            return await object.json();
        },
        async put(key, data, capturedAtMs) {
            await bucket.put(rawKey(key), JSON.stringify(data), {
                customMetadata: { capturedAtMs: String(capturedAtMs) },
            });
        },
        async capturedAtMs(key) {
            // `head` so a timestamp check never streams the capture body.
            const object = await bucket.head(rawKey(key));
            if (object === null) {
                return undefined;
            }
            const raw = object.customMetadata?.capturedAtMs;
            if (raw === undefined) {
                return undefined;
            }
            return Number(raw);
        },
    };
}
