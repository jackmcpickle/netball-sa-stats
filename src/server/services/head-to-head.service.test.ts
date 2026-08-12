import { describe, expect, it } from 'vitest';
import type { Db } from '@/db';
import { createServices } from '@/server/container';
import type { DomainError, Result } from '@/server/domain/result';
import type { SeedResult, SeedSpec } from '@/server/testing/fixtures';
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

/**
 * One FINAL 2025 season with a tier-1 and a tier-4 grade, so band filtering
 * has two bands to choose between. `dunes` fields a team in 2024 only, which
 * makes it a *past* club once 2025 is the latest ranked year — the case the
 * picker-visibility rule exists for.
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
                                        clubKey: 'dunes',
                                        clubName: 'Dunes',
                                        displayName: 'Dunes',
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
                            {
                                gradeKey: 'amnd-2025-j1',
                                name: 'Junior 1',
                                tier: 4,
                                teamCount: 2,
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax 2',
                                        ladderPosition: 1,
                                    },
                                    {
                                        clubKey: 'garville',
                                        clubName: 'Garville',
                                        displayName: 'Garville 2',
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

async function setup(): Promise<{ db: Db; seeded: SeedResult }> {
    const db = createTestDb();
    const seeded = await seed(db, baseSpec());
    await seedGames(db, seeded, [
        {
            gradeKey: 'amnd-2025-a1',
            home: 'contax',
            away: 'garville',
            round: 1,
            homeScore: 50,
            awayScore: 40,
        },
        {
            gradeKey: 'amnd-2025-j1',
            home: 'garville',
            away: 'contax',
            round: 1,
            homeScore: 30,
            awayScore: 20,
        },
        {
            gradeKey: 'amnd-2024-a1',
            home: 'contax',
            away: 'dunes',
            round: 1,
            homeScore: 60,
            awayScore: 10,
        },
    ]);
    return { db, seeded };
}

describe('headToHead.getPage', () => {
    it('returns no record until two clubs are chosen', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).headToHead.getPage({ a: 'contax' }),
        );
        expect(page.h2h).toBeNull();
        expect(page.a?.key).toBe('contax');
        expect(page.b).toBeNull();
    });

    it('returns no record when both pickers name the same club', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).headToHead.getPage({
                a: 'contax',
                b: 'contax',
            }),
        );
        expect(page.h2h).toBeNull();
    });

    it('drops an unknown club rather than erroring', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).headToHead.getPage({
                a: 'contax',
                b: 'nonesuch',
            }),
        );
        expect(page.b).toBeNull();
        expect(page.h2h).toBeNull();
    });

    it('builds the record across every grade the pair met in', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).headToHead.getPage({
                a: 'contax',
                b: 'garville',
            }),
        );
        expect(page.h2h?.record).toMatchObject({
            played: 2,
            won: 1,
            lost: 1,
            goalsFor: 70,
            goalsAgainst: 70,
        });
    });

    it('offers only bands the pair has actually met in', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).headToHead.getPage({
                a: 'contax',
                b: 'garville',
            }),
        );
        expect(page.bands.map((band) => band.tier)).toEqual([1, 4]);
    });

    it('filters the record to the chosen band', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).headToHead.getPage({
                a: 'contax',
                b: 'garville',
                band: 4,
            }),
        );
        expect(page.band).toBe(4);
        expect(page.h2h?.record.played).toBe(1);
        expect(page.h2h?.record.lost).toBe(1);
    });

    it('falls back to all grades for a band the pair never met in', async () => {
        // A hostile or stale URL gets the default view, not an empty record.
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).headToHead.getPage({
                a: 'contax',
                b: 'garville',
                band: 9,
            }),
        );
        expect(page.band).toBe('all');
        expect(page.h2h?.record.played).toBe(2);
    });

    it('hides past clubs from the pickers by default', async () => {
        const { db } = await setup();
        const page = unwrap(await createServices(db).headToHead.getPage({}));
        expect(page.clubs.map((club) => club.key)).not.toContain('dunes');
    });

    it('reveals past clubs with the toggle on', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).headToHead.getPage({ includePast: true }),
        );
        expect(page.clubs.map((club) => club.key)).toContain('dunes');
    });

    it('keeps a selected past club in the picker with the toggle off', async () => {
        // A shared link naming a defunct club must not lose its own selection.
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).headToHead.getPage({
                a: 'contax',
                b: 'dunes',
            }),
        );
        expect(page.clubs.map((club) => club.key)).toContain('dunes');
        expect(page.b?.key).toBe('dunes');
        expect(page.h2h?.record.played).toBe(1);
    });
});
