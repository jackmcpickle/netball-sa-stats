import { describe, expect, it } from 'vitest';
import { fetchClubProfile } from '@/db/queries/club-profile';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

describe('fetchClubProfile', () => {
    it('reports a null career record (not a 0% win rate) when no result has a W/L/D count', async () => {
        const db = createTestDb();
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
                                    teamCount: 2,
                                    results: [
                                        {
                                            clubKey: 'contax',
                                            clubName: 'Contax',
                                            displayName: 'Contax',
                                            ladderPosition: 1,
                                            // No won/lost/drawn given: the
                                            // row has a ladder finish but no
                                            // recorded W/L/D.
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

        const profile = await fetchClubProfile(db, 'contax');

        expect(profile).not.toBeNull();
        expect(profile?.winPercentage).toBeNull();
        expect(profile?.gamesPlayed).toBe(0);
    });

    it('marks a covered but non-final season "in-progress" rather than ranked', async () => {
        const db = createTestDb();
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
                            isFinal: false,
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

        const profile = await fetchClubProfile(db, 'contax');

        expect(profile).not.toBeNull();
        const season2025 = profile?.seasons.find(
            (season) => season.year === 2025,
        );
        expect(season2025).toEqual({
            year: 2025,
            points: 0,
            rank: null,
            status: 'in-progress',
        });
        const season2024 = profile?.seasons.find(
            (season) => season.year === 2024,
        );
        expect(season2024?.status).toBe('ranked');
    });
});
