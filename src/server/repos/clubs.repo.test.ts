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

    it('historyOf() builds a ClubHistory from the club’s results', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await createClubsRepo(db).historyOf('contax');

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.clubData().key).toBe('contax');
        expect(result.value.clubData().name).toBe('Contax');
    });

    it('historyOf() returns not-found for an unknown club key', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await createClubsRepo(db).historyOf('nobody');

        expect(result).toEqual({
            ok: false,
            error: { kind: 'not-found', entity: 'club', key: 'nobody' },
        });
    });
});
