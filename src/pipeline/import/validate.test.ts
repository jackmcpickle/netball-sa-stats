import { describe, expect, it } from 'vitest';
import type {
    ClubImportRow,
    GameImportRow,
    GradeImportRow,
    SeasonImportRow,
    TeamImportRow,
    TeamSeasonResultImportRow,
} from '@/pipeline/import/types';
import { ImportValidationError } from '@/pipeline/import/types';
import {
    validateClubAliases,
    validateGames,
    validateGrades,
    validateImportData,
    validateResults,
    validateSeasons,
    validateTeams,
} from '@/pipeline/import/validate';

const competitionKeys = new Set(['amnd']);

const goodSeason: SeasonImportRow = {
    competitionKey: 'amnd',
    competitionPeriod: 'winter',
    endYear: 2023,
    isFinal: true,
    label: 'Winter 2023',
    playhqId: 'abc123',
    seasonKey: 'amnd-winter-2023',
    source: 'playhq',
    startYear: 2023,
};

const goodClub: ClubImportRow = {
    clubKey: 'fixture-club-a',
    establishedYear: null,
    homeVenue: null,
    name: 'Fixture Club A',
    playhqId: null,
};

const goodGrade: GradeImportRow = {
    ageBand: 'Senior',
    division: null,
    gradeKey: 'amnd-winter-2023-a-grade',
    name: 'A Grade',
    playhqId: null,
    seasonKey: 'amnd-winter-2023',
    teamCount: 2,
    tier: 4,
};

const goodTeam: TeamImportRow = {
    clubKey: 'fixture-club-a',
    displayName: 'Fixture Club A',
    gradeKey: 'amnd-winter-2023-a-grade',
    playhqId: 'team-fixture-club-a',
    squadNumber: null,
};

function resultRow(
    overrides: Partial<TeamSeasonResultImportRow>,
): TeamSeasonResultImportRow {
    return {
        byes: 0,
        clubKey: 'fixture-club-a',
        displayName: 'Fixture Club A',
        drawn: 0,
        goalDifference: 100,
        goalsAgainst: 400,
        goalsFor: 500,
        gradeKey: 'amnd-winter-2023-a-grade',
        ladderPosition: 1,
        lost: 2,
        notes: null,
        percentage: 125,
        placementBasis: 'regular_season_ladder',
        played: 10,
        playhqId: 'team-fixture-club-a',
        points: 16,
        positionUncertain: false,
        scrapedAt: 1_700_000_000_000,
        shotsAttempted: null,
        shotsScored: null,
        source: 'playhq',
        squadNumber: null,
        won: 8,
        ...overrides,
    };
}

describe(validateSeasons, () => {
    it('passes a good row', () => {
        expect(() => {
            validateSeasons([goodSeason], competitionKeys);
        }).not.toThrow();
    });

    it('fails on an unknown competition_key', () => {
        expect(() => {
            validateSeasons(
                [{ ...goodSeason, competitionKey: 'not-a-competition' }],
                competitionKeys,
            );
        }).toThrow(ImportValidationError);
    });

    it('fails when summer endYear is not startYear + 1', () => {
        expect(() => {
            validateSeasons(
                [
                    {
                        ...goodSeason,
                        competitionPeriod: 'summer',
                        endYear: goodSeason.startYear,
                    },
                ],
                competitionKeys,
            );
        }).toThrow(ImportValidationError);
    });

    it('fails on a duplicate season_key', () => {
        expect(() => {
            validateSeasons([goodSeason, goodSeason], competitionKeys);
        }).toThrow(ImportValidationError);
    });
});

describe(validateClubAliases, () => {
    it('fails when club_key does not resolve via clubs.csv', () => {
        expect(() => {
            validateClubAliases(
                [
                    {
                        aliasText: 'Ghost Club',
                        clubKey: 'ghost-club',
                        source: 'playhq',
                    },
                ],
                new Set(['fixture-club-a']),
            );
        }).toThrow(ImportValidationError);
    });

    it('passes when the club_key resolves', () => {
        expect(() => {
            validateClubAliases(
                [
                    {
                        aliasText: 'Fixture Club A',
                        clubKey: 'fixture-club-a',
                        source: 'playhq',
                    },
                ],
                new Set(['fixture-club-a']),
            );
        }).not.toThrow();
    });
});

describe(validateGrades, () => {
    it('fails when season_key is unknown', () => {
        expect(() => {
            validateGrades(
                [{ ...goodGrade, seasonKey: 'no-such-season' }],
                new Set([goodSeason.seasonKey]),
            );
        }).toThrow(ImportValidationError);
    });

    it('allows two grades to share (tier, division) — A/B pools', () => {
        const pairA: GradeImportRow = {
            ...goodGrade,
            division: 4,
            gradeKey: 'amnd-winter-2023-junior-4a',
            tier: 7,
        };
        const pairB: GradeImportRow = {
            ...goodGrade,
            division: 4,
            gradeKey: 'amnd-winter-2023-junior-4b',
            tier: 7,
        };
        expect(() => {
            validateGrades([pairA, pairB], new Set([goodSeason.seasonKey]));
        }).not.toThrow();
    });
});

describe(validateTeams, () => {
    it('fails when club_key is unknown — never auto-create a club', () => {
        expect(() => {
            validateTeams(
                [{ ...goodTeam, clubKey: 'unregistered-club' }],
                new Set([goodClub.clubKey]),
                new Set([goodGrade.gradeKey]),
            );
        }).toThrow(ImportValidationError);
    });

    it('fails when grade_key is unknown', () => {
        expect(() => {
            validateTeams(
                [{ ...goodTeam, gradeKey: 'no-such-grade' }],
                new Set([goodClub.clubKey]),
                new Set([goodGrade.gradeKey]),
            );
        }).toThrow(ImportValidationError);
    });

    it('fails when two rows collide on (grade_key, playhq_id) — never last-write-wins', () => {
        // Regression fixture for the fetch-stage bug: two distinct teams from
        // one club in one grade (e.g. "Walkerville 1" and "Walkerville 2")
        // must never collapse into a single team row.
        const walkerville1: TeamImportRow = {
            ...goodTeam,
            displayName: 'Walkerville 1',
            squadNumber: null,
        };
        const walkerville2: TeamImportRow = {
            ...goodTeam,
            displayName: 'Walkerville 2',
            squadNumber: null,
        };
        expect(() => {
            validateTeams(
                [walkerville1, walkerville2],
                new Set([goodClub.clubKey]),
                new Set([goodGrade.gradeKey]),
            );
        }).toThrow(ImportValidationError);
    });

    it('passes two colour-named (unnumbered) teams of one club sharing a grade, distinguished by playhq_id', () => {
        // The Finding 1 regression case: neither team has a genuine numeric
        // suffix, so squad_number stays null for both — identity comes from
        // playhq_id alone, never a fabricated index.
        const purple: TeamImportRow = {
            ...goodTeam,
            displayName: 'City Coasters Purple',
            playhqId: 'team-city-coasters-purple',
            squadNumber: null,
        };
        const orange: TeamImportRow = {
            ...goodTeam,
            displayName: 'City Coasters Orange',
            playhqId: 'team-city-coasters-orange',
            squadNumber: null,
        };
        expect(() => {
            validateTeams(
                [purple, orange],
                new Set([goodClub.clubKey]),
                new Set([goodGrade.gradeKey]),
            );
        }).not.toThrow();
    });

    it('passes two teams of one club in one grade when squad numbers genuinely differ', () => {
        const walkerville1: TeamImportRow = {
            ...goodTeam,
            displayName: 'Walkerville 1',
            playhqId: 'team-walkerville-1',
            squadNumber: 1,
        };
        const walkerville2: TeamImportRow = {
            ...goodTeam,
            displayName: 'Walkerville 2',
            playhqId: 'team-walkerville-2',
            squadNumber: 2,
        };
        expect(() => {
            validateTeams(
                [walkerville1, walkerville2],
                new Set([goodClub.clubKey]),
                new Set([goodGrade.gradeKey]),
            );
        }).not.toThrow();
    });
});

describe(validateResults, () => {
    const clubKeys = new Set([goodClub.clubKey]);
    const gradesByKey = new Map([[goodGrade.gradeKey, goodGrade]]);

    it('passes ladder positions that are exactly 1..n', () => {
        const rows = [
            resultRow({ ladderPosition: 1, playhqId: 'a', squadNumber: 1 }),
            resultRow({
                clubKey: 'fixture-club-a',
                ladderPosition: 2,
                playhqId: 'b',
                squadNumber: 2,
            }),
        ];
        expect(() => {
            validateResults(rows, clubKeys, gradesByKey);
        }).not.toThrow();
    });

    it('fails on a gap in ladder positions', () => {
        const rows = [
            resultRow({ ladderPosition: 1 }),
            resultRow({ ladderPosition: 3 }),
        ];
        expect(() => {
            validateResults(rows, clubKeys, gradesByKey);
        }).toThrow(ImportValidationError);
    });

    it('fails on a duplicate ladder position', () => {
        const rows = [
            resultRow({ ladderPosition: 1 }),
            resultRow({ ladderPosition: 1 }),
        ];
        expect(() => {
            validateResults(rows, clubKeys, gradesByKey);
        }).toThrow(ImportValidationError);
    });

    it("fails when a grade's team_count does not match its result rows", () => {
        const rows = [resultRow({ ladderPosition: 1 })];
        // goodGrade.teamCount is 2, but only 1 result row is supplied.
        expect(() => {
            validateResults(rows, clubKeys, gradesByKey);
        }).toThrow(ImportValidationError);
    });

    it('warns (does not fail) when played does not equal won + drawn + lost, annotates notes, and leaves values unchanged', () => {
        const mismatched = resultRow({
            drawn: 0,
            ladderPosition: 1,
            lost: 1,
            played: 10,
            playhqId: 'a',
            squadNumber: 1,
            won: 1,
        });
        const rows = [
            mismatched,
            resultRow({ ladderPosition: 2, playhqId: 'b', squadNumber: 2 }),
        ];

        const warnings = validateResults(rows, clubKeys, gradesByKey);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatchObject({
            clubKey: mismatched.clubKey,
            displayName: mismatched.displayName,
            drawn: 0,
            gradeKey: goodGrade.gradeKey,
            lost: 1,
            played: 10,
            won: 1,
        });
        // Values themselves are untouched — only `notes` is annotated.
        expect(mismatched.played).toBe(10);
        expect(mismatched.won).toBe(1);
        expect(mismatched.drawn).toBe(0);
        expect(mismatched.lost).toBe(1);
        expect(mismatched.notes).toContain('played=10');
        expect(mismatched.notes).toContain('won+drawn+lost=2');
    });

    it('fails on negative goals', () => {
        const rows = [
            resultRow({ goalsFor: -5, ladderPosition: 1 }),
            resultRow({ ladderPosition: 2 }),
        ];
        expect(() => {
            validateResults(rows, clubKeys, gradesByKey);
        }).toThrow('goalsFor: Too small: expected number to be >=0');
    });

    it('fails when club_key does not resolve', () => {
        const rows = [
            resultRow({ clubKey: 'unregistered-club', ladderPosition: 1 }),
            resultRow({ ladderPosition: 2 }),
        ];
        expect(() => {
            validateResults(rows, clubKeys, gradesByKey);
        }).toThrow('club_key unregistered-club not found in clubs.csv');
    });
});

describe(validateImportData, () => {
    it('warns (not fails) on a sharp team-count change between seasons', () => {
        const prevSeason: SeasonImportRow = {
            ...goodSeason,
            endYear: 2022,
            seasonKey: 'amnd-winter-2022',
            startYear: 2022,
        };
        const prevGrade: GradeImportRow = {
            ...goodGrade,
            gradeKey: 'amnd-winter-2022-a-grade',
            seasonKey: prevSeason.seasonKey,
            teamCount: 10,
        };
        const currGrade: GradeImportRow = { ...goodGrade, teamCount: 2 };

        const clubs = [goodClub];
        const prevResults = Array.from({ length: 10 }, (_, i) =>
            resultRow({
                gradeKey: prevGrade.gradeKey,
                ladderPosition: i + 1,
                playhqId: `prev-${String(i + 1)}`,
                squadNumber: i + 1,
            }),
        );
        const currResults = [
            resultRow({ ladderPosition: 1, playhqId: 'a', squadNumber: 1 }),
            resultRow({ ladderPosition: 2, playhqId: 'b', squadNumber: 2 }),
        ];

        const { teamCountWarnings, playedMismatchWarnings } =
            validateImportData(
                {
                    clubAliases: [],
                    clubs,
                    games: [],
                    grades: [prevGrade, currGrade],
                    results: [...prevResults, ...currResults],
                    seasons: [prevSeason, goodSeason],
                    teams: [goodTeam],
                },
                competitionKeys,
            );

        expect(teamCountWarnings).toHaveLength(1);
        expect(teamCountWarnings[0]).toMatchObject({
            gradeKey: currGrade.gradeKey,
            previousTeamCount: 10,
            teamCount: 2,
        });
        expect(playedMismatchWarnings).toHaveLength(0);
    });
});

function gameRow(overrides: Partial<GameImportRow> = {}): GameImportRow {
    return {
        awayPlayhqId: 't2',
        awayScore: 30,
        file: 'games-2026.csv',
        forfeitingSide: null,
        gradeKey: 'premier-2026',
        homePlayhqId: 't1',
        homeScore: 40,
        isFinals: false,
        playedAt: null,
        playhqId: 'g1',
        round: 1,
        roundName: 'Round 1',
        scrapedAt: 1,
        source: 'playhq',
        status: 'final',
        ...overrides,
    };
}

describe(validateGames, () => {
    // Resolved season-wide, not grade-scoped: a team regraded after junior
    // grading rounds plays games in a grade whose ladder it never reaches.
    const teamIds = new Set(['t1', 't2']);
    const gradeKeys = new Set(['premier-2026']);

    it('accepts a well-formed final', () => {
        expect(() => {
            validateGames([gameRow()], teamIds, gradeKeys);
        }).not.toThrow();
    });

    it('reports (and skips) a team id that is on no ladder anywhere', () => {
        // A team that withdrew before completing a game. Never invented, but
        // one abandoned fixture must not block the whole import.
        const unresolved = validateGames(
            [gameRow({ homePlayhqId: 'ghost' })],
            teamIds,
            gradeKeys,
        );
        expect(unresolved).toHaveLength(1);
        expect(unresolved[0].missingTeamIds).toStrictEqual(['ghost']);
    });

    it('accepts a team whose ladder row lives in another grade', () => {
        // Junior grading rounds: the game was played in this grade, and must
        // not be dropped just because the team was regraded afterwards.
        expect(
            validateGames([gameRow()], new Set(['t1', 't2']), gradeKeys),
        ).toStrictEqual([]);
    });

    it('fails on a grade that is not in grades.csv', () => {
        expect(() => {
            validateGames(
                [gameRow({ gradeKey: 'nope-2026' })],
                teamIds,
                gradeKeys,
            );
        }).toThrow(/grade_key/u);
    });

    it('rejects an unknown status', () => {
        expect(() => {
            validateGames(
                [gameRow({ status: 'abandoned-ish' })],
                teamIds,
                gradeKeys,
            );
        }).toThrow(/status/u);
    });

    it('rejects a final missing a score', () => {
        // A final with no score is a no_result; letting it through would put
        // a phantom 0-0 into every head-to-head record.
        expect(() => {
            validateGames([gameRow({ homeScore: null })], teamIds, gradeKeys);
        }).toThrow(/score/u);
    });

    it('rejects a bye carrying a score', () => {
        expect(() => {
            validateGames(
                [
                    gameRow({
                        awayPlayhqId: null,
                        awayScore: null,
                        homeScore: 20,
                        status: 'bye',
                    }),
                ],
                teamIds,
                gradeKeys,
            );
        }).toThrow(/bye/u);
    });

    it('allows a bye with one empty side', () => {
        expect(() => {
            validateGames(
                [
                    gameRow({
                        awayPlayhqId: null,
                        awayScore: null,
                        homeScore: null,
                        status: 'bye',
                    }),
                ],
                teamIds,
                gradeKeys,
            );
        }).not.toThrow();
    });

    it('allows a scheduled game with no scores', () => {
        expect(() => {
            validateGames(
                [
                    gameRow({
                        awayScore: null,
                        homeScore: null,
                        status: 'scheduled',
                    }),
                ],
                teamIds,
                gradeKeys,
            );
        }).not.toThrow();
    });

    it('allows a scheduled finals game with an undecided side', () => {
        // A ProvisionalTeam has no id, so there is nothing to resolve.
        expect(() => {
            validateGames(
                [
                    gameRow({
                        awayPlayhqId: null,
                        awayScore: null,
                        homeScore: null,
                        status: 'scheduled',
                    }),
                ],
                teamIds,
                gradeKeys,
            );
        }).not.toThrow();
    });

    it('rejects a game whose two sides are the same team', () => {
        expect(() => {
            validateGames(
                [gameRow({ awayPlayhqId: 't1' })],
                teamIds,
                gradeKeys,
            );
        }).toThrow(/same team/u);
    });

    it('rejects a forfeit with no forfeiting side', () => {
        expect(() => {
            validateGames(
                [
                    gameRow({
                        awayScore: 20,
                        forfeitingSide: null,
                        homeScore: 0,
                        status: 'forfeit',
                    }),
                ],
                teamIds,
                gradeKeys,
            );
        }).toThrow(/forfeiting_side/u);
    });

    it('rejects a duplicate (grade, playhq id)', () => {
        // The unique index would reject it at insert; catching it here names
        // the CSV line instead of failing mid-batch.
        expect(() => {
            validateGames([gameRow(), gameRow()], teamIds, gradeKeys);
        }).toThrow(/duplicate/u);
    });
});
