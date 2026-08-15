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
                        grades: [
                            {
                                gradeKey: 'amnd-2025-a1',
                                name: 'A1',
                                results,
                                teamCount: 2,
                                tier: 1,
                            },
                            {
                                gradeKey: 'amnd-2025-b1',
                                name: 'B1',
                                results,
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
                                results,
                                teamCount: 2,
                                tier: 1,
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

async function setup(): Promise<{ db: Db; seeded: SeedResult }> {
    const db = createTestDb();
    const seeded = await seed(db, baseSpec());
    await seedGames(db, seeded, [
        {
            away: 'garville',
            awayScore: 32,
            gradeKey: 'amnd-2025-a1',
            home: 'contax',
            homeScore: 50,
            round: 1,
        },
        {
            away: 'contax',
            awayScore: 0,
            gradeKey: 'amnd-2025-a1',
            home: 'garville',
            homeScore: 20,
            round: 2,
            status: 'forfeit',
        },
        {
            away: null,
            gradeKey: 'amnd-2025-a1',
            home: 'contax',
            round: 3,
            status: 'bye',
        },
        {
            away: null,
            gradeKey: 'amnd-2025-a1',
            home: null,
            isFinals: true,
            round: 99,
            roundName: 'Grand Final',
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
                grade: 'amnd-2025-a1',
                year: 2025,
            }),
        );
        expect(page.fixtures?.totalRows).toBe(4);
    });

    it('keeps a bye and an undecided final in the list', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).results.getPage({
                grade: 'amnd-2025-a1',
                year: 2025,
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
                grade: 'amnd-2025-a1',
                year: 2025,
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
                grade: 'amnd-2025-a1',
                year: 2025,
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
                grade: 'nonesuch',
                year: 2025,
            }),
        );
        expect(page.fixtures?.grade.key).toBe('amnd-2025-a1');
    });

    it('clamps an out-of-range page rather than returning nothing', async () => {
        const { db } = await setup();
        const page = unwrap(
            await createServices(db).results.getPage({
                grade: 'amnd-2025-a1',
                page: 999,
                year: 2025,
            }),
        );
        expect(page.fixtures?.rows.length).toBe(4);
        expect(page.fixtures?.tableState.page).toBe(1);
    });
});
