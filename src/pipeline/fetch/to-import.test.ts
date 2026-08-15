import { describe, expect, it } from 'vitest';
import type { ClubAliasRow, ClubRow } from '@/pipeline/fetch/club-registry';
import type { GameRow } from '@/pipeline/fetch/games';
import type { GradeRow, SeasonRow, TeamRow } from '@/pipeline/fetch/run';
import { toImportData } from '@/pipeline/fetch/to-import';

const season: SeasonRow = {
    competition_key: 'amnd',
    competition_period: 'winter',
    end_year: 2025,
    is_final: 0,
    label: 'Winter 2025',
    playhq_id: 'season-playhq-id',
    season_key: 'amnd-winter-2025',
    source: 'playhq',
    start_year: 2025,
    status: 'active',
};

const club: ClubRow = {
    club_key: 'matrics',
    established_year: '1952',
    home_venue: 'Matrics Courts',
    name: 'Matrics',
    playhq_id: 'club-playhq-id',
};

const alias: ClubAliasRow = {
    alias_text: 'MATRICS',
    club_key: 'matrics',
    source: 'playhq',
};

const grade: GradeRow = {
    age_band: 'Senior',
    division: null,
    grade_key: 'amnd-winter-2025-a-grade',
    name: 'A GRADE',
    playhq_id: 'grade-playhq-id',
    season_key: 'amnd-winter-2025',
    team_count: 2,
    tier: 4,
};

const team: TeamRow = {
    club_key: 'matrics',
    display_name: 'Matrics',
    grade_key: 'amnd-winter-2025-a-grade',
    playhq_id: 'team-playhq-id',
    squad_number: 1,
};

const result = {
    byes: 0,
    club_key: 'matrics',
    display_name: 'Matrics',
    drawn: 0,
    goal_difference: 100,
    goals_against: 400,
    goals_for: 500,
    grade_key: 'amnd-winter-2025-a-grade',
    ladder_position: 1,
    lost: 2,
    notes: null,
    percentage: 125,
    placement_basis: 'regular_season_ladder',
    played: 10,
    playhq_id: 'team-playhq-id',
    points: 16,
    position_uncertain: 0,
    scraped_at: 1_700_000_000_000,
    shots_attempted: null,
    shots_scored: null,
    source: 'playhq',
    squad_number: 1,
    won: 8,
};

const game: GameRow = {
    away_playhq_id: 'team-away',
    away_score: 48,
    forfeiting_side: null,
    grade_key: 'amnd-winter-2025-a-grade',
    home_playhq_id: 'team-home',
    home_score: 49,
    is_finals: 0,
    played_at: 1_743_830_100,
    playhq_id: 'game-playhq-id',
    round: 1,
    round_name: 'Round 1',
    scraped_at: 1_700_000_000_000,
    source: 'playhq',
    status: 'final',
};

describe(toImportData, () => {
    it('maps a SeasonRow is_final: 0 to isFinal false, keeping source and playhqId', () => {
        const data = toImportData({
            aliases: [],
            clubs: [],
            games: [],
            grades: [],
            results: [],
            seasons: [season],
            teams: [],
        });
        expect(data.seasons).toStrictEqual([
            {
                competitionKey: 'amnd',
                competitionPeriod: 'winter',
                endYear: 2025,
                isFinal: false,
                label: 'Winter 2025',
                playhqId: 'season-playhq-id',
                seasonKey: 'amnd-winter-2025',
                source: 'playhq',
                startYear: 2025,
            },
        ]);
    });

    it('maps is_final: 1 to isFinal true', () => {
        const data = toImportData({
            aliases: [],
            clubs: [],
            games: [],
            grades: [],
            results: [],
            seasons: [{ ...season, is_final: 1 }],
            teams: [],
        });
        expect(data.seasons[0]?.isFinal).toBeTruthy();
    });

    it('maps a GameRow to GameImportRow with games-<year>.csv from the season year', () => {
        const data = toImportData({
            aliases: [],
            clubs: [],
            games: [game],
            grades: [],
            results: [],
            seasons: [],
            teams: [],
        });
        expect(data.games).toStrictEqual([
            {
                awayPlayhqId: 'team-away',
                awayScore: 48,
                file: 'games-2025.csv',
                forfeitingSide: null,
                gradeKey: 'amnd-winter-2025-a-grade',
                homePlayhqId: 'team-home',
                homeScore: 49,
                isFinals: false,
                playedAt: 1_743_830_100,
                playhqId: 'game-playhq-id',
                round: 1,
                roundName: 'Round 1',
                scrapedAt: 1_700_000_000_000,
                source: 'playhq',
                status: 'final',
            },
        ]);
    });

    it('derives games-<year>.csv from played_at when grade_key has no season year', () => {
        const data = toImportData({
            aliases: [],
            clubs: [],
            games: [{ ...game, grade_key: 'unkeyed-grade' }],
            grades: [],
            results: [],
            seasons: [],
            teams: [],
        });
        expect(data.games[0]?.file).toBe('games-2025.csv');
    });

    it('maps clubs, aliases, grades, teams and results using parse.ts field names', () => {
        const data = toImportData({
            aliases: [alias],
            clubs: [club],
            games: [game],
            grades: [grade],
            results: [result],
            seasons: [season],
            teams: [team],
        });
        expect(data.clubs).toStrictEqual([
            {
                clubKey: 'matrics',
                establishedYear: 1952,
                homeVenue: 'Matrics Courts',
                name: 'Matrics',
                playhqId: 'club-playhq-id',
            },
        ]);
        expect(data.clubAliases).toStrictEqual([
            {
                aliasText: 'MATRICS',
                clubKey: 'matrics',
                source: 'playhq',
            },
        ]);
        expect(data.grades).toStrictEqual([
            {
                ageBand: 'Senior',
                division: null,
                gradeKey: 'amnd-winter-2025-a-grade',
                name: 'A GRADE',
                playhqId: 'grade-playhq-id',
                seasonKey: 'amnd-winter-2025',
                teamCount: 2,
                tier: 4,
            },
        ]);
        expect(data.teams).toStrictEqual([
            {
                clubKey: 'matrics',
                displayName: 'Matrics',
                gradeKey: 'amnd-winter-2025-a-grade',
                playhqId: 'team-playhq-id',
                squadNumber: 1,
            },
        ]);
        expect(data.results).toStrictEqual([
            {
                byes: 0,
                clubKey: 'matrics',
                displayName: 'Matrics',
                drawn: 0,
                goalDifference: 100,
                goalsAgainst: 400,
                goalsFor: 500,
                gradeKey: 'amnd-winter-2025-a-grade',
                ladderPosition: 1,
                lost: 2,
                notes: null,
                percentage: 125,
                placementBasis: 'regular_season_ladder',
                played: 10,
                playhqId: 'team-playhq-id',
                points: 16,
                positionUncertain: false,
                scrapedAt: 1_700_000_000_000,
                shotsAttempted: null,
                shotsScored: null,
                source: 'playhq',
                squadNumber: 1,
                won: 8,
            },
        ]);
    });
});
