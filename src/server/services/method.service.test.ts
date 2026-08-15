import { describe, expect, it } from 'vitest';
import { createServices } from '@/server/container';
import type { DomainError, Result } from '@/server/domain/result';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

function unwrap<T>(result: Result<T, DomainError>): T {
    if (!result.ok) {
        throw new Error(
            `expected ok result, got error: ${JSON.stringify(result.error)}`,
        );
    }
    return result.value;
}

/**
 * One competition ('amnd') with two FINAL seasons (2024 tier 2, 2025 tier 1)
 * so `getCoverage` reports two distinct ranked years, and `listGradeWeights`
 * has two distinct (competition, tier) weight rows to report — one per
 * season, since each uses a different tier.
 */
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
                                gradeKey: 'amnd-2025-premier',
                                name: 'Premier',
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
                        ],
                        isFinal: true,
                        seasonKey: 'amnd-2025',
                        startYear: 2025,
                    },
                ],
            },
        ],
    };
}

describe('method service', () => {
    it('returns coverage years and grade weights', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = unwrap(await createServices(db).method.getPage());

        expect(result.coverage.years).toStrictEqual([2024, 2025]);
        expect(result.coverage.rankedYears).toStrictEqual([2024, 2025]);
        // isSampleData is a module-level constant, not derived from the
        // seeded db — it just reflects IS_SAMPLE_DATA, which is currently
        // `false`.
        expect(result.isSampleData).toBeFalsy();

        expect(result.weights).toHaveLength(2);
        // Ordered by tier ascending: tier 1 (Premier) before tier 2 (A1).
        expect(result.weights[0]).toMatchObject({
            competitionName: 'AMND',
            label: 'Premier',
            tier: 1,
            weight: 1,
        });
        expect(result.weights[1]).toMatchObject({
            competitionName: 'AMND',
            label: 'A1',
            tier: 2,
            weight: 1,
        });
    });
});
