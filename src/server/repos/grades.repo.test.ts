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
        expect(result.value.teamCount()).toBe(2);
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
