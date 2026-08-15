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
 * Shared seed: one competition ('amnd') with two FINAL seasons (2024, 2025),
 * each a single tier-2 grade of two clubs — 'contax' and 'garville' — so
 * both are ranked in the latest (2025) season and count as "present".
 * 'ajax' is ranked only in the earlier 2024 season, so it drops out of the
 * latest season's rows and becomes a "past" club with lastRankedYear 2024.
 * 'phantom' only ever plays in a NON-FINAL 2026 season, so it never appears
 * in the championship at all (fetchChampionshipHistory filters to
 * `finalOnly`) — it is neither present nor "last ranked" any year.
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
                    {
                        seasonKey: 'amnd-2026',
                        startYear: 2026,
                        isFinal: false,
                        grades: [
                            {
                                gradeKey: 'amnd-2026-a1',
                                name: 'A1',
                                tier: 2,
                                teamCount: 1,
                                results: [
                                    {
                                        clubKey: 'phantom',
                                        clubName: 'Phantom',
                                        displayName: 'Phantom',
                                        ladderPosition: 1,
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

describe('clubs index service', () => {
    it('hides unranked clubs by default and orders present before past', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const defaultResult = unwrap(
            await createServices(db).clubs.getIndexPage({}),
        );

        // includePast defaults to false: only the two clubs ranked in the
        // latest (2025) season show up, regardless of the four clubs in the
        // clubs table overall.
        expect(defaultResult.year).toBe(2025);
        expect(defaultResult.includePast).toBeFalsy();
        expect(defaultResult.presentCount).toBe(2);
        expect(defaultResult.totalCount).toBe(4);
        expect(
            defaultResult.entries.map((entry) => entry.club.key).sort(),
        ).toStrictEqual(['contax', 'garville']);

        const withPast = unwrap(
            await createServices(db).clubs.getIndexPage({ includePast: true }),
        );

        // Present entries (2) come first, past entries (ajax, phantom) after.
        expect(
            withPast.entries
                .slice(0, 2)
                .map((entry) => entry.club.key)
                .sort(),
        ).toStrictEqual(['contax', 'garville']);
        expect(
            withPast.entries
                .slice(2)
                .map((entry) => entry.club.key)
                .sort(),
        ).toStrictEqual(['ajax', 'phantom']);
    });

    it('includes past clubs with includePast, with lastRankedYear filled', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = unwrap(
            await createServices(db).clubs.getIndexPage({ includePast: true }),
        );

        const ajax = result.entries.find((entry) => entry.club.key === 'ajax');
        expect(ajax).toBeDefined();
        expect(ajax?.lastRankedYear).toBe(2024);
        // ajax has no row in the latest (2025) championship season.
        expect(ajax?.rank).toBeNull();
        expect(ajax?.points).toBeNull();
        expect(ajax?.teams).toBeNull();
    });

    it('fills null rank/points/teams for clubs absent from the championship', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = unwrap(
            await createServices(db).clubs.getIndexPage({ includePast: true }),
        );

        const phantom = result.entries.find(
            (entry) => entry.club.key === 'phantom',
        );
        expect(phantom).toBeDefined();
        // 'phantom' only ever played in a non-final season, so it never
        // enters the championship history — lastRankedYear stays null, not
        // just rank/points/teams.
        expect(phantom?.lastRankedYear).toBeNull();
        expect(phantom?.rank).toBeNull();
        expect(phantom?.points).toBeNull();
        expect(phantom?.teams).toBeNull();
    });

    it('returns no-ranked-seasons for a completely empty database', async () => {
        const db = createTestDb();

        const result = await createServices(db).clubs.getIndexPage({});

        expect(result.ok).toBeFalsy();
        expect(!result.ok && result.error).toStrictEqual({
            kind: 'no-ranked-seasons',
        });
    });
});
