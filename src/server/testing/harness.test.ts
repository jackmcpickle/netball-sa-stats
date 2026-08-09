import { describe, expect, it } from 'vitest';
import { clubs } from '@/db/schema';
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
});
