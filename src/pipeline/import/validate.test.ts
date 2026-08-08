import { describe, expect, it } from 'vitest';
import type {
    ClubImportRow,
    GradeImportRow,
    SeasonImportRow,
    TeamImportRow,
    TeamSeasonResultImportRow,
} from '@/pipeline/import/types';
import { ImportValidationError } from '@/pipeline/import/types';
import {
    validateClubAliases,
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
    playhqId: null,
};

function resultRow(
    overrides: Partial<TeamSeasonResultImportRow>,
): TeamSeasonResultImportRow {
    return {
        gradeKey: 'amnd-winter-2023-a-grade',
        clubKey: 'fixture-club-a',
        squadNumber: null,
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
});

describe('validateResults', () => {
    const clubKeys = new Set([goodClub.clubKey]);
    const gradesByKey = new Map([[goodGrade.gradeKey, goodGrade]]);

    it('passes ladder positions that are exactly 1..n', () => {
        const rows = [
            resultRow({ ladderPosition: 1 }),
            resultRow({ ladderPosition: 2, clubKey: 'fixture-club-a' }),
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
        });
        const rows = [mismatched, resultRow({ ladderPosition: 2 })];

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
            }),
        );
        const currResults = [
            resultRow({ ladderPosition: 1 }),
            resultRow({ ladderPosition: 2 }),
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
