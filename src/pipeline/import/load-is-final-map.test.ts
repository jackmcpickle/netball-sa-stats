import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteExecutor } from '@/pipeline/import/executors';
import { loadIsFinalMap } from '@/pipeline/import/playhq-job';
import { runImport } from '@/pipeline/import/run';
import { createMigratedDb } from '@/pipeline/import/sqlite-test-db';
import type { ImportExecutor } from '@/pipeline/import/types';

const FIXTURE_DIR = resolve(import.meta.dirname, '__fixtures__/basic');

describe(loadIsFinalMap, () => {
    let db: DatabaseSync;

    beforeEach(async () => {
        db = await createMigratedDb();
    });

    afterEach(() => {
        db.close();
    });

    it('loads curated CSV is_final as 0/1 strings from a fixture import', async () => {
        await runImport({
            dataDir: FIXTURE_DIR,
            executor: createSqliteExecutor(db),
        });
        const map = await loadIsFinalMap(createSqliteExecutor(db));
        expect(map.get('amnd-winter-2023')).toBe('1');
        expect(map.get('amnd-winter-2024')).toBe('1');
        expect(map.get('missing-season')).toBeUndefined();
    });

    it('stringifies D1 boolean and integer is_final to CSV 0/1', async () => {
        const executor: ImportExecutor = {
            queryAll: async () => [
                { season_key: 'final-true', is_final: true },
                { season_key: 'final-one', is_final: 1 },
                { season_key: 'open-false', is_final: false },
                { season_key: 'open-zero', is_final: 0 },
            ],
            batch: async () => {
                await Promise.resolve();
            },
        };
        const map = await loadIsFinalMap(executor);
        expect(map.get('final-true')).toBe('1');
        expect(map.get('final-one')).toBe('1');
        expect(map.get('open-false')).toBe('0');
        expect(map.get('open-zero')).toBe('0');
    });
});
