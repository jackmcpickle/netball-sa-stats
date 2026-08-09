import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { clubs, competitions } from '@/db/schema';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

describe('test harness', () => {
    it('runs a real drizzle query against migrated in-memory sqlite', async () => {
        const db = createTestDb();
        await db.insert(clubs).values({ clubKey: 'contax', name: 'Contax' });
        const rows = await db.select().from(clubs);
        expect(rows).toHaveLength(1);
        expect(rows[0].clubKey).toBe('contax');
    });

    it('seeds a season graph and returns ids', async () => {
        const db = createTestDb();
        const ids = await seed(db, {
            competitions: [
                {
                    key: 'amnd',
                    name: 'AMND',
                    seasons: [
                        {
                            seasonKey: 'amnd-2025',
                            startYear: 2025,
                            isFinal: true,
                            grades: [
                                {
                                    gradeKey: 'a1-2025',
                                    name: 'A1',
                                    tier: 2,
                                    teamCount: 2,
                                    results: [
                                        {
                                            clubKey: 'contax',
                                            clubName: 'Contax',
                                            displayName: 'Contax',
                                            ladderPosition: 1,
                                        },
                                        {
                                            clubKey: 'garville',
                                            clubName: 'Garville',
                                            displayName: 'Garville',
                                            ladderPosition: 2,
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        });
        expect(ids.clubs.get('contax')).toBeTypeOf('number');
        const all = await db.select().from(clubs);
        expect(all).toHaveLength(2);
    });

    it('starts with an empty database, not the production seed rows', async () => {
        const db = createTestDb();
        const rows = await db.select().from(competitions);
        expect(rows).toHaveLength(0);
    });

    it('rejects a duplicate competition key instead of silently merging', async () => {
        const db = createTestDb();
        const spec = {
            competitions: [
                {
                    key: 'amnd',
                    name: 'AMND',
                    seasons: [] as never[],
                },
            ],
        };
        await seed(db, spec);
        await expect(seed(db, spec)).rejects.toThrow();
    });

    it('applies the latest migration (0003 unique team playhq index)', async () => {
        const db = createTestDb();
        const indexRows = await db.all<{ name: string }>(
            sql`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'teams_grade_playhq_idx'`,
        );
        expect(indexRows).toHaveLength(1);
    });

    it('supports a single-row .get() query alongside .all()', async () => {
        const db = createTestDb();
        await db.insert(clubs).values({ clubKey: 'contax', name: 'Contax' });
        await db
            .insert(clubs)
            .values({ clubKey: 'garville', name: 'Garville' });

        const row = await db
            .select()
            .from(clubs)
            .where(eq(clubs.clubKey, 'garville'))
            .get();

        expect(row?.clubKey).toBe('garville');
    });
});
