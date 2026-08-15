// src/pipeline/fetch/playhq-client.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '@/pipeline/fetch/capture-store';
import { cachedGraphQL } from '@/pipeline/fetch/playhq-client';

describe(cachedGraphQL, () => {
    it('returns the store hit when cacheFirst is true and does not fetch', async () => {
        const store = createMemoryStore(
            new Map([
                [
                    'discoverCompetitions_abc.json',
                    { data: { cached: true }, capturedAtMs: 1 },
                ],
            ]),
        );
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const result = await cachedGraphQL(
            store,
            'discoverCompetitions_abc.json',
            'discoverCompetitions',
            { organisationID: 'abc' },
            true,
        );
        expect(result).toStrictEqual({ cached: true });
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });

    it('fetches and puts when cacheFirst is false even if the store has a hit', async () => {
        const store = createMemoryStore(
            new Map([
                [
                    'discoverCompetitions_abc.json',
                    { data: { cached: true }, capturedAtMs: 1 },
                ],
            ]),
        );
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ data: { fresh: true } }), {
                status: 200,
            }),
        );
        const result = await cachedGraphQL(
            store,
            'discoverCompetitions_abc.json',
            'discoverCompetitions',
            { organisationID: 'abc' },
            false,
        );
        expect(result).toStrictEqual({ data: { fresh: true } });
        await expect(
            store.get('discoverCompetitions_abc.json'),
        ).resolves.toStrictEqual({
            data: { fresh: true },
        });
        vi.restoreAllMocks();
    });
});
