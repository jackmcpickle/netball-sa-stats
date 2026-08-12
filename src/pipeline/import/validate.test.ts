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
    seasonKey: 'amnd-winter-2023',
    competitionPeriod: 'winter',
    label: 'Winter 2023',
    startYear: 2023,
    endYear: 2023,
    isFinal: true,
    playhqId: 'abc123',
    source: 'playhq',
};

const goodClub: ClubImportRow = {
    clubKey: 'fixture-club-a',
    name: 'Fixture Club A',
    establishedYear: null,
    homeVenue: null,
    playhqId: null,
};

const goodGrade: GradeImportRow = {
    seasonKey: 'amnd-winter-2023',
    gradeKey: 'amnd-winter-2023-a-grade',
    name: 'A Grade',
    tier: 4,
    division: null,
    teamCount: 2,
    ageBand: 'Senior',
    playhqId: null,
};

const goodTeam: TeamImportRow = {
    clubKey: 'fixture-club-a',
    gradeKey: 'amnd-winter-2023-a-grade',
    displayName: 'Fixture Club A',
    squadNumber: null,
    playhqId: 'team-fixture-club-a',
};

function resultRow(
    overrides: Partial<TeamSeasonResultImportRow>,
): TeamSeasonResultImportRow {
    return {
        gradeKey: 'amnd-winter-2023-a-grade',
        clubKey: 'fixture-club-a',
        squadNumber: null,
        playhqId: 'team-fixture-club-a',
        displayName: 'Fixture Club A',
        ladderPosition: 1,
        positionUncertain: false,
        played: 10,
        won: 8,
        drawn: 0,
        lost: 2,
        byes: 0,
        goalsFor: 500,
        goalsAgainst: 400,
        goalDifference: 100,
        points: 16,
        percentage: 125,
        shotsAttempted: null,
        shotsScored: null,
        source: 'playhq',
        placementBasis: 'regular_season_ladder',
        notes: null,
        scrapedAt: 1700000000000,
        ...overrides,
    };
}

describe('validateSeasons', () => {
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

describe('validateClubAliases', () => {
    it('fails when club_key does not resolve via clubs.csv', () => {
        expect(() => {
            validateClubAliases(
                [
                    {
                        clubKey: 'ghost-club',
                        aliasText: 'Ghost Club',
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
                        clubKey: 'fixture-club-a',
                        aliasText: 'Fixture Club A',
                        source: 'playhq',
                    },
                ],
                new Set(['fixture-club-a']),
            );
        }).not.toThrow();
    });
});

describe('validateGrades', () => {
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
            gradeKey: 'amnd-winter-2023-junior-4a',
            tier: 7,
            division: 4,
        };
        const pairB: GradeImportRow = {
            ...goodGrade,
            gradeKey: 'amnd-winter-2023-junior-4b',
            tier: 7,
            division: 4,
        };
        expect(() => {
            validateGrades([pairA, pairB], new Set([goodSeason.seasonKey]));
        }).not.toThrow();
    });
});

describe('validateTeams', () => {
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
            squadNumber: null,
            playhqId: 'team-city-coasters-purple',
        };
        const orange: TeamImportRow = {
            ...goodTeam,
            displayName: 'City Coasters Orange',
            squadNumber: null,
            playhqId: 'team-city-coasters-orange',
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
            squadNumber: 1,
            playhqId: 'team-walkerville-1',
        };
        const walkerville2: TeamImportRow = {
            ...goodTeam,
            displayName: 'Walkerville 2',
            squadNumber: 2,
            playhqId: 'team-walkerville-2',
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

describe('validateResults', () => {
    const clubKeys = new Set([goodClub.clubKey]);
    const gradesByKey = new Map([[goodGrade.gradeKey, goodGrade]]);

    it('passes ladder positions that are exactly 1..n', () => {
        const rows = [
            resultRow({ ladderPosition: 1, squadNumber: 1, playhqId: 'a' }),
            resultRow({
                ladderPosition: 2,
                clubKey: 'fixture-club-a',
                squadNumber: 2,
                playhqId: 'b',
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
            ladderPosition: 1,
            played: 10,
            won: 1,
            drawn: 0,
            lost: 1,
            squadNumber: 1,
            playhqId: 'a',
        });
        const rows = [
            mismatched,
            resultRow({ ladderPosition: 2, squadNumber: 2, playhqId: 'b' }),
        ];

        const warnings = validateResults(rows, clubKeys, gradesByKey);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatchObject({
            gradeKey: goodGrade.gradeKey,
            clubKey: mismatched.clubKey,
            displayName: mismatched.displayName,
            played: 10,
            won: 1,
            drawn: 0,
            lost: 1,
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
            resultRow({ ladderPosition: 1, goalsFor: -5 }),
            resultRow({ ladderPosition: 2 }),
        ];
        expect(() => {
            validateResults(rows, clubKeys, gradesByKey);
        }).toThrow();
    });

    it('fails when club_key does not resolve', () => {
        const rows = [
            resultRow({ ladderPosition: 1, clubKey: 'unregistered-club' }),
            resultRow({ ladderPosition: 2 }),
        ];
        expect(() => {
            validateResults(rows, clubKeys, gradesByKey);
        }).toThrow();
    });
});

describe('validateImportData', () => {
    it('warns (not fails) on a sharp team-count change between seasons', () => {
        const prevSeason: SeasonImportRow = {
            ...goodSeason,
            seasonKey: 'amnd-winter-2022',
            startYear: 2022,
            endYear: 2022,
        };
        const prevGrade: GradeImportRow = {
            ...goodGrade,
            seasonKey: prevSeason.seasonKey,
            gradeKey: 'amnd-winter-2022-a-grade',
            teamCount: 10,
        };
        const currGrade: GradeImportRow = { ...goodGrade, teamCount: 2 };

        const clubs = [goodClub];
        const prevResults = Array.from({ length: 10 }, (_, i) =>
            resultRow({
                gradeKey: prevGrade.gradeKey,
                ladderPosition: i + 1,
                squadNumber: i + 1,
                playhqId: `prev-${String(i + 1)}`,
            }),
        );
        const currResults = [
            resultRow({ ladderPosition: 1, squadNumber: 1, playhqId: 'a' }),
            resultRow({ ladderPosition: 2, squadNumber: 2, playhqId: 'b' }),
        ];

        const { teamCountWarnings, playedMismatchWarnings } =
            validateImportData(
                {
                    seasons: [prevSeason, goodSeason],
                    clubs,
                    clubAliases: [],
                    grades: [prevGrade, currGrade],
                    teams: [goodTeam],
                    results: [...prevResults, ...currResults],
                    games: [],
                },
                competitionKeys,
            );

        expect(teamCountWarnings).toHaveLength(1);
        expect(teamCountWarnings[0]).toMatchObject({
            gradeKey: currGrade.gradeKey,
            teamCount: 2,
            previousTeamCount: 10,
        });
        expect(playedMismatchWarnings).toHaveLength(0);
    });
});

describe('validateGames', () => {
    // Team identity is grade-scoped, so the resolution map is keyed
    // `${gradeKey}:${playhqId}` — see `teams_grade_playhq_idx` in schema.ts.
    const teamIds = new Map([
        ['premier-2026:t1', 1],
        ['premier-2026:t2', 2],
    ]);
    const gradeKeys = new Set(['premier-2026']);

    function gameRow(overrides: Partial<GameImportRow> = {}): GameImportRow {
        return {
            gradeKey: 'premier-2026',
            playhqId: 'g1',
            round: 1,
            roundName: 'Round 1',
            playedAt: null,
            homePlayhqId: 't1',
            awayPlayhqId: 't2',
            homeScore: 40,
            awayScore: 30,
            status: 'final',
            forfeitingSide: null,
            source: 'playhq',
            scrapedAt: 1,
            file: 'games-2026.csv',
            ...overrides,
        };
    }

    it('accepts a well-formed final', () => {
        expect(() => {
            validateGames([gameRow()], teamIds, gradeKeys);
        }).not.toThrow();
    });

    it('fails loudly on a team id that is not in teams.csv', () => {
        expect(() => {
            validateGames(
                [gameRow({ homePlayhqId: 'ghost' })],
                teamIds,
                gradeKeys,
            );
        }).toThrow(ImportValidationError);
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
                        status: 'bye',
                        awayPlayhqId: null,
                        homeScore: 20,
                        awayScore: null,
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
                        status: 'bye',
                        awayPlayhqId: null,
                        homeScore: null,
                        awayScore: null,
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
                        status: 'scheduled',
                        homeScore: null,
                        awayScore: null,
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
                        status: 'scheduled',
                        awayPlayhqId: null,
                        homeScore: null,
                        awayScore: null,
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
                        status: 'forfeit',
                        forfeitingSide: null,
                        homeScore: 0,
                        awayScore: 20,
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
