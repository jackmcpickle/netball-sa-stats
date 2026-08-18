import { describe, expect, it } from 'vitest';
import { createServices } from '@/server/container';
import type { DomainError, Result } from '@/server/domain/result';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed, seedGames } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

function unwrap<T>(result: Result<T, DomainError>): T {
    if (!result.ok) {
        throw new Error(
            `expected ok result, got error: ${JSON.stringify(result.error)}`,
        );
    }
    return result.value;
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
                                        clubKey: 'garville',
                                        clubName: 'Garville',
                                        displayName: 'Garville',
                                        ladderPosition: 1,
                                    },
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
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
                    {
                        grades: [
                            {
                                gradeKey: 'amnd-2026-a1',
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
                                tier: 2,
                            },
                        ],
                        isFinal: false,
                        seasonKey: 'amnd-2026',
                        startYear: 2026,
                    },
                ],
            },
        ],
    };
}

describe('faq service', () => {
    it('uses the latest ranked season for the leader and skips in-progress years', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());
        const page = unwrap(await createServices(db).faq.getPage());
        expect(page.latestRankedYear).toBe(2025);
        expect(page.leader?.club.key).toBe('garville');
        expect(page.fixtureFromYear).toBeNull();
    });

    it('reports the earliest fixture year when games exist', async () => {
        const db = createTestDb();
        const seeded = await seed(db, baseSpec());
        await seedGames(db, seeded, [
            {
                away: 'garville',
                awayScore: 30,
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                homeScore: 40,
                round: 1,
            },
        ]);
        const page = unwrap(await createServices(db).faq.getPage());
        expect(page.fixtureFromYear).toBe(2025);
    });

    it('returns ok with null leader when the latest ranked year has no championship rows', async () => {
        const db = createTestDb();
        await seed(db, {
            competitions: [
                {
                    key: 'empty-comp',
                    name: 'Empty Comp',
                    seasons: [
                        {
                            grades: [],
                            isFinal: true,
                            seasonKey: 'empty-2023',
                            startYear: 2023,
                        },
                    ],
                },
            ],
        });
        const page = unwrap(await createServices(db).faq.getPage());
        expect(page.latestRankedYear).toBe(2023);
        expect(page.leader).toBeNull();
    });

    it('returns ok over an empty database', async () => {
        const db = createTestDb();
        const page = unwrap(await createServices(db).faq.getPage());
        expect(page.latestRankedYear).toBeNull();
        expect(page.leader).toBeNull();
        expect(page.fixtureFromYear).toBeNull();
    });
});
