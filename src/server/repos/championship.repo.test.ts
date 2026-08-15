import { describe, expect, it } from 'vitest';
import { createChampionshipRepo } from '@/server/repos/championship.repo';
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
                                        won: 10,
                                        lost: 0,
                                        drawn: 0,
                                    },
                                    {
                                        clubKey: 'garville',
                                        clubName: 'Garville',
                                        displayName: 'Garville',
                                        ladderPosition: 2,
                                        won: 0,
                                        lost: 10,
                                        drawn: 0,
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        seasonKey: 'amnd-2025',
                        startYear: 2025,
                        isFinal: false,
                        grades: [
                            {
                                gradeKey: 'amnd-2025-a1',
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
                        ],
                    },
                ],
            },
        ],
    };
}

describe(createChampionshipRepo, () => {
    it('history() ranks only final seasons, oldest first', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const history = await createChampionshipRepo(db).history();

        // The 2025 season is not final, so only 2024 is ranked.
        expect(history).toHaveLength(1);
        expect(history[0]?.year).toBe(2024);
        expect(history[0]?.rows.map((row) => row.club.key)).toStrictEqual([
            'contax',
            'garville',
        ]);
        expect(history[0]?.rows[0]?.rank).toBe(1);

        // Concrete per-row values for the top two clubs, so a mis-mapped
        // column (e.g. points swapped with teams, or winPercentage read
        // from the wrong club) would fail this test.
        const [contaxRow, garvilleRow] = history[0]?.rows ?? [];
        // teamCount 2, ladderPosition 1 -> placing 2, weight 1 -> 2 points.
        expect(contaxRow?.points).toBe(2);
        // won 10 / played 10 -> 100%.
        expect(contaxRow?.winPercentage).toBe(100);
        // No prior ranked season exists yet, so previousRank is null.
        expect(contaxRow?.previousRank).toBeNull();

        expect(garvilleRow?.rank).toBe(2);
        // teamCount 2, ladderPosition 2 -> placing 1, weight 1 -> 1 point.
        expect(garvilleRow?.points).toBe(1);
        // won 0 / played 10 -> 0%.
        expect(garvilleRow?.winPercentage).toBe(0);
        expect(garvilleRow?.previousRank).toBeNull();

        // Only one ranked season exists, so there is nothing to compare
        // coverage against.
        expect(history[0]?.coverageChanged).toBeFalsy();
    });

    it('history() over an empty database returns no seasons', async () => {
        const db = createTestDb();

        const history = await createChampionshipRepo(db).history();

        expect(history).toStrictEqual([]);
    });
});
