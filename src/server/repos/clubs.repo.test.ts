import { describe, expect, it } from 'vitest';
import { createClubsRepo } from '@/server/repos/clubs.repo';
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
                        ],
                    },
                ],
            },
        ],
    };
}

describe('createClubsRepo', () => {
    it('all() lists every club, alphabetically by name', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const clubs = await createClubsRepo(db).all();

        expect(clubs.map((club) => club.key)).toEqual(['contax', 'garville']);
    });

    it('all() over an empty database is an empty collection', async () => {
        const db = createTestDb();

        const clubs = await createClubsRepo(db).all();

        expect(clubs).toEqual([]);
    });

    it('profile() rolls up career stats across seasons for a known club', async () => {
        const db = createTestDb();
        // Two final seasons, contax finishing 1st both times — 1st of 3 in
        // 2024, 1st of 2 in 2025 — so it has real career data to roll up.
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
                                    gradeKey: 'amnd-2024-a1',
                                    name: 'A1',
                                    tier: 2,
                                    teamCount: 3,
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
                                        {
                                            clubKey: 'ajax',
                                            clubName: 'Ajax',
                                            displayName: 'Ajax',
                                            ladderPosition: 3,
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
                                    gradeKey: 'amnd-2025-a1',
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
        };
        await seed(db, spec);

        const profile = await createClubsRepo(db).profile('contax');

        expect(profile).not.toBeNull();
        // teamPoints = (teamCount - ladderPosition + 1) * weight (weight 1):
        // 2024 -> (3 - 1 + 1) = 3, 2025 -> (2 - 1 + 1) = 2. Rank is 1 both
        // seasons since contax has the most points each year.
        expect(profile?.currentRank).toBe(1);
        expect(profile?.bestRank).toBe(1);
        expect(profile?.bestRankYear).toBe(2024);
        expect(profile?.careerPoints).toBe(5);
        // Ladder position 1, not position-uncertain, in both seasons.
        expect(profile?.minorPremierships).toBe(2);
        // No won/lost/drawn counts were seeded, so there is no record to
        // compute a win percentage from — null, not 0%.
        expect(profile?.winPercentage).toBeNull();
        expect(profile?.results.length).toBe(2);
    });

    it('profile() returns null for an unknown club key', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const profile = await createClubsRepo(db).profile('nobody');

        expect(profile).toBeNull();
    });
});
