import { describe, expect, it } from 'vitest';
import { LADDER_TABLE_SPEC } from '@/db/queries/grades';
import type { PageRequest } from '@/server/domain/table-query';
import { TableQuery } from '@/server/domain/table-query';
import { createGradesRepo } from '@/server/repos/grades.repo';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

/** A page large enough to hold any ladder these tests seed. */
function wholeLadder(sort: string, dir: 'asc' | 'desc'): PageRequest {
    return TableQuery.from(
        { dir, pageSize: 100, sort },
        LADDER_TABLE_SPEC,
    ).request();
}

function baseSpec(): SeedSpec {
    return {
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
                                tier: 1,
                            },
                            {
                                gradeKey: 'amnd-2024-b1',
                                name: 'B1',
                                results: [
                                    {
                                        clubKey: 'ajax',
                                        clubName: 'Ajax',
                                        displayName: 'Ajax',
                                        ladderPosition: 1,
                                    },
                                ],
                                teamCount: 1,
                                tier: 2,
                            },
                        ],
                        isFinal: true,
                        seasonKey: 'amnd-2024',
                        startYear: 2024,
                    },
                ],
            },
        ],
    };
}

describe(createGradesRepo, () => {
    it('forYear() lists that year’s grades, strongest tier first', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const gradesFor2024 = await createGradesRepo(db).forYear(2024);

        expect(gradesFor2024.map((grade) => grade.key)).toStrictEqual([
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
                            grades: [
                                {
                                    gradeKey: 'amnd-2024-c1',
                                    name: 'C1',
                                    results: [
                                        {
                                            clubKey: 'zeta',
                                            clubName: 'Zeta',
                                            displayName: 'Zeta',
                                            ladderPosition: 1,
                                        },
                                    ],
                                    teamCount: 1,
                                    tier: 3,
                                },
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
                                    ],
                                    teamCount: 1,
                                    tier: 1,
                                },
                                {
                                    gradeKey: 'amnd-2024-b1',
                                    name: 'B1',
                                    results: [
                                        {
                                            clubKey: 'ajax',
                                            clubName: 'Ajax',
                                            displayName: 'Ajax',
                                            ladderPosition: 1,
                                        },
                                    ],
                                    teamCount: 1,
                                    tier: 2,
                                },
                            ],
                            isFinal: true,
                            seasonKey: 'amnd-2024',
                            startYear: 2024,
                        },
                    ],
                },
            ],
        };
        await seed(db, spec);

        const gradesFor2024 = await createGradesRepo(db).forYear(2024);

        expect(gradesFor2024.map((grade) => grade.key)).toStrictEqual([
            'amnd-2024-a1',
            'amnd-2024-b1',
            'amnd-2024-c1',
        ]);
    });

    it('forYear() for a year with no seasons is an empty collection', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const gradesFor2099 = await createGradesRepo(db).forYear(2099);

        expect(gradesFor2099).toStrictEqual([]);
    });

    it('ladderPage() returns the grade and its rows, position ascending', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await createGradesRepo(db).ladderPage(
            'amnd-2024-a1',
            wholeLadder('position', 'asc'),
        );

        expect(result.ok).toBeTruthy();
        if (!result.ok) {
            return;
        }
        expect(result.value.grade.key).toBe('amnd-2024-a1');
        expect(result.value.rows.map((row) => row.position)).toStrictEqual([
            1, 2,
        ]);
    });

    it('countLadder() counts the grade’s rows', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        await expect(
            createGradesRepo(db).countLadder('amnd-2024-a1'),
        ).resolves.toBe(2);
        await expect(
            createGradesRepo(db).countLadder('nonesuch'),
        ).resolves.toBe(0);
    });

    it('ladderPage() sorts on an allow-listed column, ties broken by position', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await createGradesRepo(db).ladderPage(
            'amnd-2024-a1',
            wholeLadder('team', 'asc'),
        );

        expect(result.ok).toBeTruthy();
        if (!result.ok) {
            return;
        }
        expect(result.value.rows.map((row) => row.displayName)).toStrictEqual([
            'Contax',
            'Garville',
        ]);
    });

    it('ladderPage() slices to the requested page', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await createGradesRepo(db).ladderPage('amnd-2024-a1', {
            ...wholeLadder('position', 'asc'),
            limit: 1,
            offset: 1,
        });

        expect(result.ok).toBeTruthy();
        if (!result.ok) {
            return;
        }
        expect(result.value.rows.map((row) => row.position)).toStrictEqual([2]);
    });

    it('ladderPage() returns not-found for an unknown grade key', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await createGradesRepo(db).ladderPage(
            'does-not-exist',
            wholeLadder('position', 'asc'),
        );

        expect(result).toStrictEqual({
            error: {
                entity: 'grade',
                key: 'does-not-exist',
                kind: 'not-found',
            },
            ok: false,
        });
    });
});
