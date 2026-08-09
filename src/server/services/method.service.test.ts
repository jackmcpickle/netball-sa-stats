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
                        seasonKey: 'amnd-2024',
                        startYear: 2024,
                        isFinal: true,
                        grades: [
                            {
                                gradeKey: 'amnd-2024-a1',
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
                    {
                        seasonKey: 'amnd-2025',
                        startYear: 2025,
                        isFinal: true,
                        grades: [
                            {
                                gradeKey: 'amnd-2025-premier',
                                name: 'Premier',
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
                        ],
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

        expect(result.coverage.years).toEqual([2024, 2025]);
        expect(result.coverage.rankedYears).toEqual([2024, 2025]);
        // isSampleData is a module-level constant, not derived from the
        // seeded db, so it just reflects IS_SAMPLE_DATA in this run.
        expect(typeof result.isSampleData).toBe('boolean');

        expect(result.weights).toHaveLength(2);
        // Ordered by tier ascending: tier 1 (Premier) before tier 2 (A1).
        expect(result.weights[0]).toMatchObject({
            tier: 1,
            label: 'Premier',
            weight: 1,
            competitionName: 'AMND',
        });
        expect(result.weights[1]).toMatchObject({
            tier: 2,
            label: 'A1',
            weight: 1,
            competitionName: 'AMND',
        });
    });
});
