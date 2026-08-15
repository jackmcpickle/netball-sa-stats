import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { fetchResults } from '@/db/queries/results';
import { clubs, competitions, gradeWeights } from '@/db/schema';
import { seed } from '@/server/testing/fixtures';
import type { SeedSpec } from '@/server/testing/fixtures';
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
                            grades: [
                                {
                                    gradeKey: 'a1-2025',
                                    name: 'A1',
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
                                    teamCount: 2,
                                    tier: 2,
                                },
                            ],
                            isFinal: true,
                            seasonKey: 'amnd-2025',
                            startYear: 2025,
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
        const spec: SeedSpec = {
            competitions: [
                {
                    key: 'amnd',
                    name: 'AMND',
                    seasons: [],
                },
            ],
        };
        await seed(db, spec);
        await expect(seed(db, spec)).rejects.toThrow(
            /Failed query: insert into "competitions"/u,
        );
    });

    it('applies the latest migration (0003 unique team playhq index)', async () => {
        const db = createTestDb();
        const indexRows = await db.all<{ name: string }>(
            sql`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'teams_grade_playhq_idx'`,
        );
        expect(indexRows).toHaveLength(1);
    });

    it('de-dupes grade_weights rows for two same-tier seasons under one competition', async () => {
        const db = createTestDb();
        const spec = {
            competitions: [
                {
                    key: 'amnd',
                    name: 'AMND',
                    seasons: [
                        {
                            grades: [
                                {
                                    gradeKey: 'amnd-2024-a1',
                                    name: 'A1',
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
                                    teamCount: 2,
                                    tier: 2,
                                },
                            ],
                            isFinal: true,
                            seasonKey: 'amnd-2024',
                            startYear: 2024,
                        },
                        {
                            grades: [
                                {
                                    gradeKey: 'amnd-2025-a1',
                                    name: 'A1',
                                    results: [
                                        {
                                            clubKey: 'contax',
                                            clubName: 'Contax',
                                            displayName: 'Contax',
                                            ladderPosition: 2,
                                        },
                                        {
                                            clubKey: 'garville',
                                            clubName: 'Garville',
                                            displayName: 'Garville',
                                            ladderPosition: 1,
                                        },
                                    ],
                                    teamCount: 2,
                                    tier: 2,
                                },
                            ],
                            isFinal: true,
                            seasonKey: 'amnd-2025',
                            startYear: 2025,
                        },
                    ],
                },
            ],
        };

        await seed(db, spec);

        const weightRows = await db.select().from(gradeWeights);
        expect(weightRows).toHaveLength(1);

        const resultRows = await fetchResults(db);
        expect(resultRows).toHaveLength(4);
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
