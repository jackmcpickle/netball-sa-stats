import { describe, expect, it } from 'vitest';
import { createGradesRepo } from '@/server/repos/grades.repo';
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

describe('createGradesRepo', () => {
    it('forYear() lists that year’s grades, strongest tier first', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const gradesFor2024 = await createGradesRepo(db).forYear(2024);

        expect(gradesFor2024.map((grade) => grade.key)).toEqual([
            'amnd-2024-a1',
            'amnd-2024-b1',
        ]);
    });

    it('forYear() orders by tier, not by insertion order', async () => {
        const db = createTestDb();
        // Insert tier 3, then tier 1, then tier 2 — deliberately not in
        // tier order — so a missing/wrong ORDER BY (falling back to
        // insertion/primary-key order) genuinely fails this test.
        const spec: SeedSpec = {
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
                                    gradeKey: 'amnd-2024-c1',
                                    name: 'C1',
                                    tier: 3,
                                    teamCount: 1,
                                    results: [
                                        {
                                            clubKey: 'zeta',
                                            clubName: 'Zeta',
                                            displayName: 'Zeta',
                                            ladderPosition: 1,
                                        },
                                    ],
                                },
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
        await seed(db, spec);

        const gradesFor2024 = await createGradesRepo(db).forYear(2024);

        expect(gradesFor2024.map((grade) => grade.key)).toEqual([
            'amnd-2024-a1',
            'amnd-2024-b1',
            'amnd-2024-c1',
        ]);
    });

    it('forYear() for a year with no seasons is an empty collection', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const gradesFor2099 = await createGradesRepo(db).forYear(2099);

        expect(gradesFor2099).toEqual([]);
    });

    it('ladder() builds a Ladder over the grade’s rows, position ascending', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await createGradesRepo(db).ladder('amnd-2024-a1');

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.grade().key).toBe('amnd-2024-a1');
    });

    it('ladder() returns not-found for an unknown grade key', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await createGradesRepo(db).ladder('does-not-exist');

        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'not-found',
                entity: 'grade',
                key: 'does-not-exist',
            },
        });
    });
});
