import { describe, expect, it } from 'vitest';
import { createWeightsRepo } from '@/server/repos/weights.repo';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

function baseSpec(): SeedSpec {
    return {
        competitions: [
            {
                key: 'amnd',
                name: 'AMND',
                seasons: [
                    {
                        seasonKey: 'amnd-2024',
                        startYear: 2024,
                        isFinal: true,
                        grades: [
                            {
                                gradeKey: 'amnd-2024-a1',
                                name: 'A1',
                                tier: 1,
                                teamCount: 1,
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        ladderPosition: 1,
                                    },
                                ],
                            },
                            {
                                gradeKey: 'amnd-2024-b1',
                                name: 'B1',
                                tier: 2,
                                teamCount: 1,
                                results: [
                                    {
                                        clubKey: 'ajax',
                                        clubName: 'Ajax',
                                        displayName: 'Ajax',
                                        ladderPosition: 1,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

describe('createWeightsRepo', () => {
    it('all() lists every grade_weights row, tier ascending', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const weights = await createWeightsRepo(db).all();

        expect(weights.map((row) => row.tier)).toEqual([1, 2]);
        expect(weights[0]).toMatchObject({
            competitionName: 'AMND',
            label: 'A1',
            tier: 1,
            division: null,
            weight: 1,
        });
    });

    it('all() over an empty database is an empty collection', async () => {
        const db = createTestDb();

        const weights = await createWeightsRepo(db).all();

        expect(weights).toEqual([]);
    });
});
