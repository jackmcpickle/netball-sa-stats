import { describe, expect, it } from 'vitest';
import type { ResultRow } from '@/db/queries/results';
import {
    createChampionshipRepo,
    rowsForChampionship,
} from '@/server/repos/championship.repo';
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
                        grades: [
                            {
                                gradeKey: 'amnd-2024-a1',
                                name: 'A1',
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        drawn: 0,
                                        ladderPosition: 1,
                                        lost: 0,
                                        won: 10,
                                    },
                                    {
                                        clubKey: 'garville',
                                        clubName: 'Garville',
                                        displayName: 'Garville',
                                        drawn: 0,
                                        ladderPosition: 2,
                                        lost: 10,
                                        won: 0,
                                    },
                                ],
                                teamCount: 2,
                                tier: 1,
                            },
                        ],
                        isFinal: true,
                        seasonKey: 'amnd-2024',
                        startYear: 2024,
                    },
                    {
                        grades: [
                            {
                                gradeKey: 'amnd-2025-a1',
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
                                tier: 1,
                            },
                        ],
                        isFinal: false,
                        seasonKey: 'amnd-2025',
                        startYear: 2025,
                    },
                ],
            },
        ],
    };
}

function resultRow(competitionKey: string, clubKey: string): ResultRow {
    return {
        clubKey,
        clubName: clubKey,
        competitionKey,
        competitionName: competitionKey,
        displayName: clubKey,
        drawn: 0,
        establishedYear: null,
        goalsAgainst: 0,
        goalsFor: 0,
        gradeKey: `${competitionKey}-a1`,
        gradeName: 'A1',
        homeVenue: null,
        isFinal: true,
        ladderPosition: 1,
        lost: 0,
        notes: null,
        percentage: 100,
        placementBasis: 'regular_season_ladder',
        played: 10,
        points: 20,
        positionUncertain: false,
        source: 'playhq',
        teamCount: 8,
        tier: 1,
        weight: 1,
        won: 10,
        year: 2024,
    };
}

describe(rowsForChampionship, () => {
    it('keeps AMND and Premier League rows and drops association rows', () => {
        const kept = rowsForChampionship([
            resultRow('amnd', 'contax'),
            resultRow('saucna', 'falcons'),
            resultRow('premier_league', 'garville'),
            resultRow('elizabeth', 'spiders'),
        ]);
        expect(kept.map((row) => row.competitionKey)).toStrictEqual([
            'amnd',
            'premier_league',
        ]);
    });
});

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

    it('history(competitionKey) ranks that league alone', async () => {
        const db = createTestDb();
        const spec = baseSpec();
        spec.competitions.push({
            key: 'premier_league',
            name: 'Premier League',
            seasons: [
                {
                    grades: [
                        {
                            gradeKey: 'pl-2024-prem',
                            name: 'Premier Division',
                            results: [
                                {
                                    clubKey: 'garville',
                                    clubName: 'Garville',
                                    displayName: 'Garville',
                                    ladderPosition: 1,
                                },
                            ],
                            teamCount: 1,
                            tier: 1,
                        },
                    ],
                    isFinal: true,
                    seasonKey: 'pl-2024',
                    startYear: 2024,
                },
            ],
        });
        await seed(db, spec);

        const amndOnly = await createChampionshipRepo(db).history('amnd');
        expect(amndOnly[0]?.rows.map((row) => row.club.key)).toStrictEqual([
            'contax',
            'garville',
        ]);

        const combined = await createChampionshipRepo(db).history();
        expect(
            combined[0]?.rows.some((row) => row.club.key === 'garville'),
        ).toBeTruthy();
    });

    it('history() over an empty database returns no seasons', async () => {
        const db = createTestDb();

        const history = await createChampionshipRepo(db).history();

        expect(history).toStrictEqual([]);
    });
});
