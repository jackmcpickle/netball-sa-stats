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

/** 2025 has two grades; 2026 has one, and no fixtures at all. */
function baseSpec(): SeedSpec {
    const results = [
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
    ];
    return {
        competitions: [
            {
                key: 'amnd',
                name: 'AMND',
                seasons: [
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
                                results,
                            },
                            {
                                gradeKey: 'amnd-2025-b1',
                                name: 'B1',
                                tier: 2,
                                teamCount: 2,
                                results,
                            },
                        ],
                    },
                    {
                        seasonKey: 'amnd-2026',
                        startYear: 2026,
                        isFinal: false,
                        grades: [
                            {
                                gradeKey: 'amnd-2026-a1',
                                name: 'A1',
                                tier: 1,
                                teamCount: 2,
                                results,
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
            awayScore: 32,
        },
        {
            gradeKey: 'amnd-2025-a1',
            home: 'garville',
            away: 'contax',
            round: 2,
            homeScore: 20,
            awayScore: 0,
            status: 'forfeit',
        },
        {
            gradeKey: 'amnd-2025-a1',
            home: 'contax',
            away: null,
            round: 3,
            status: 'bye',
        },
        {
            gradeKey: 'amnd-2025-a1',
            home: null,
            away: null,
            round: 99,
            roundName: 'Grand Final',
            isFinals: true,
            status: 'scheduled',
        },
    ]);
    return { db, seeded };
}

describe('results.getPage', () => {
    it('defaults to the latest season and its first grade', async () => {
        const { db } = await setup();
        const page = unwrap(await createServices(db).results.getPage({}));
        expect(page.year).toBe(2026);
        expect(page.grades.map((grade) => grade.key)).toStrictEqual([
            'amnd-2026-a1',
        ]);
    });

    it('reports no fixtures for a grade that has none', async () => {
        // A real state, not an error: ladders reach back further than
        // fixtures do.
        const { db } = await setup();
        const page = unwrap(await createServices(db).results.getPage({}));
        expect(page.fixtures).toBeNull();
    });

    it('lists every fixture in the chosen grade', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).results.getPage({
                year: 2025,
                grade: 'amnd-2025-a1',
            }),
        );
        expect(page.fixtures?.totalRows).toBe(4);
    });

    it('keeps a bye and an undecided final in the list', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).results.getPage({
                year: 2025,
                grade: 'amnd-2025-a1',
            }),
        );
        const rows = page.fixtures?.rows ?? [];
        expect(rows.map((row) => row.status)).toStrictEqual([
            'final',
            'forfeit',
            'bye',
            'scheduled',
        ]);
        expect(rows[3].homeTeamName).toBeNull();
        expect(rows[3].roundName).toBe('Grand Final');
    });

    it('shows a margin for a played game and none for a forfeit', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).results.getPage({
                year: 2025,
                grade: 'amnd-2025-a1',
            }),
        );
        const rows = page.fixtures?.rows ?? [];
        expect(rows[0].margin).toBe(18);
        expect(rows[1].margin).toBeNull();
    });

    it('marks only two-club fixtures as comparable', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).results.getPage({
                year: 2025,
                grade: 'amnd-2025-a1',
            }),
        );
        expect(page.fixtures?.rows.map((row) => row.canCompare)).toStrictEqual([
            true,
            true,
            false,
            false,
        ]);
    });

    it('falls back to the first grade for an unknown grade key', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).results.getPage({
                year: 2025,
                grade: 'nonesuch',
            }),
        );
        expect(page.fixtures?.grade.key).toBe('amnd-2025-a1');
    });

    it('clamps an out-of-range page rather than returning nothing', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).results.getPage({
                year: 2025,
                grade: 'amnd-2025-a1',
                page: 999,
            }),
        );
        expect(page.fixtures?.rows.length).toBe(4);
        expect(page.fixtures?.tableState.page).toBe(1);
    });
});
