import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clubRegistryFromExecutor } from '@/pipeline/fetch/club-registry-from-db';
import { createSqliteExecutor } from '@/pipeline/import/executors';
import { runImport } from '@/pipeline/import/run';
import { createMigratedDb } from '@/pipeline/import/sqlite-test-db';

const FIXTURE_DIR = resolve(
    import.meta.dirname,
    '../import/__fixtures__/basic',
);

const KNOWN_PLAYHQ_ID = 'known-playhq-a';

describe(clubRegistryFromExecutor, () => {
    let db: DatabaseSync;

    beforeEach(async () => {
        db = await createMigratedDb();
        await runImport({
            dataDir: FIXTURE_DIR,
            executor: createSqliteExecutor(db),
        });
        db.exec(
            `UPDATE clubs SET playhq_id = '${KNOWN_PLAYHQ_ID}', established_year = 1975 WHERE club_key = 'fixture-club-a'`,
        );
    });

    afterEach(() => {
        db.close();
    });

    it('resolves a known playhq id to the curated club_key', async () => {
        const registry = await clubRegistryFromExecutor(
            createSqliteExecutor(db).queryAll,
        );

        expect(registry.resolve(KNOWN_PLAYHQ_ID, 'Fixture Club A')).toBe(
            'fixture-club-a',
        );
        expect(
            registry
                .getClubs()
                .find((club) => club.club_key === 'fixture-club-a'),
        ).toMatchObject({
            club_key: 'fixture-club-a',
            name: 'Fixture Club A',
            established_year: '1975',
            home_venue: null,
            playhq_id: KNOWN_PLAYHQ_ID,
        });
        expect(
            registry
                .getAliases()
                .find((alias) => alias.alias_text === 'Fixture Club A'),
        ).toMatchObject({
            club_key: 'fixture-club-a',
            alias_text: 'Fixture Club A',
            source: 'playhq',
        });
    });

    it('mints a slug for a new organisation id', async () => {
        const registry = await clubRegistryFromExecutor(
            createSqliteExecutor(db).queryAll,
        );

        expect(registry.resolve('brand-new-org', 'Newtown Netball Club')).toBe(
            'newtown-netball-club',
        );
    });
});
