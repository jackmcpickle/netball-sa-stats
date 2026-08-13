import { describe, expect, it } from 'vitest';
import type { CsvValue } from '@/pipeline/csv';
import type { ClubAliasRow, ClubRow } from '@/pipeline/fetch/club-registry';
import type { GameRow } from '@/pipeline/fetch/games';
import type { GradeRow, SeasonRow, TeamRow } from '@/pipeline/fetch/run';
import { toImportData } from '@/pipeline/fetch/to-import';

const season: SeasonRow = {
    competition_key: 'amnd',
    season_key: 'amnd-winter-2025',
    competition_period: 'winter',
    label: 'Winter 2025',
    start_year: 2025,
    end_year: 2025,
    is_final: 0,
    playhq_id: 'season-playhq-id',
    source: 'playhq',
    status: 'active',
};

const club: ClubRow = {
    club_key: 'matrics',
    name: 'Matrics',
    established_year: '1952',
    home_venue: 'Matrics Courts',
    playhq_id: 'club-playhq-id',
};

const alias: ClubAliasRow = {
    club_key: 'matrics',
    alias_text: 'MATRICS',
    source: 'playhq',
};

const grade: GradeRow = {
    season_key: 'amnd-winter-2025',
    grade_key: 'amnd-winter-2025-a-grade',
    name: 'A GRADE',
    tier: 4,
    division: null,
    team_count: 2,
    age_band: 'Senior',
    playhq_id: 'grade-playhq-id',
};

const team: TeamRow = {
    club_key: 'matrics',
    grade_key: 'amnd-winter-2025-a-grade',
    display_name: 'Matrics',
    squad_number: 1,
    playhq_id: 'team-playhq-id',
};

const result: Record<string, CsvValue> = {
    grade_key: 'amnd-winter-2025-a-grade',
    club_key: 'matrics',
    squad_number: 1,
    playhq_id: 'team-playhq-id',
    display_name: 'Matrics',
    ladder_position: 1,
    position_uncertain: 0,
    played: 10,
    won: 8,
    drawn: 0,
    lost: 2,
    byes: 0,
    goals_for: 500,
    goals_against: 400,
    goal_difference: 100,
    points: 16,
    percentage: 125,
    shots_attempted: null,
    shots_scored: null,
    source: 'playhq',
    placement_basis: 'regular_season_ladder',
    notes: null,
    scraped_at: 1_700_000_000_000,
};

const game: GameRow = {
    grade_key: 'amnd-winter-2025-a-grade',
    playhq_id: 'game-playhq-id',
    round: 1,
    round_name: 'Round 1',
    is_finals: 0,
    played_at: 1_743_830_100,
    home_playhq_id: 'team-home',
    away_playhq_id: 'team-away',
    home_score: 49,
    away_score: 48,
    status: 'final',
    forfeiting_side: null,
    source: 'playhq',
    scraped_at: 1_700_000_000_000,
};

describe('toImportData', () => {
    it('maps a SeasonRow is_final: 0 to isFinal false, keeping source and playhqId', () => {
        const data = toImportData({
            seasons: [season],
            clubs: [],
            aliases: [],
            grades: [],
            teams: [],
            results: [],
            games: [],
        });
        expect(data.seasons).toEqual([
            {
                competitionKey: 'amnd',
                seasonKey: 'amnd-winter-2025',
                competitionPeriod: 'winter',
                label: 'Winter 2025',
                startYear: 2025,
                endYear: 2025,
                isFinal: false,
                playhqId: 'season-playhq-id',
                source: 'playhq',
            },
        ]);
    });

    it('maps is_final: 1 to isFinal true', () => {
        const data = toImportData({
            seasons: [{ ...season, is_final: 1 }],
            clubs: [],
            aliases: [],
            grades: [],
            teams: [],
            results: [],
            games: [],
        });
        expect(data.seasons[0]?.isFinal).toBe(true);
    });

    it('maps a GameRow to GameImportRow with games-<year>.csv from the season year', () => {
        const data = toImportData({
            seasons: [],
            clubs: [],
            aliases: [],
            grades: [],
            teams: [],
            results: [],
            games: [game],
        });
        expect(data.games).toEqual([
            {
                gradeKey: 'amnd-winter-2025-a-grade',
                playhqId: 'game-playhq-id',
                round: 1,
                roundName: 'Round 1',
                isFinals: false,
                playedAt: 1_743_830_100,
                homePlayhqId: 'team-home',
                awayPlayhqId: 'team-away',
                homeScore: 49,
                awayScore: 48,
                status: 'final',
                forfeitingSide: null,
                source: 'playhq',
                scrapedAt: 1_700_000_000_000,
                file: 'games-2025.csv',
            },
        ]);
    });

    it('derives games-<year>.csv from played_at when grade_key has no season year', () => {
        const data = toImportData({
            seasons: [],
            clubs: [],
            aliases: [],
            grades: [],
            teams: [],
            results: [],
            games: [{ ...game, grade_key: 'unkeyed-grade' }],
        });
        expect(data.games[0]?.file).toBe('games-2025.csv');
    });

    it('maps clubs, aliases, grades, teams and results using parse.ts field names', () => {
        const data = toImportData({
            seasons: [season],
            clubs: [club],
            aliases: [alias],
            grades: [grade],
            teams: [team],
            results: [result],
            games: [game],
        });
        expect(data.clubs).toEqual([
            {
                clubKey: 'matrics',
                name: 'Matrics',
                establishedYear: 1952,
                homeVenue: 'Matrics Courts',
                playhqId: 'club-playhq-id',
            },
        ]);
        expect(data.clubAliases).toEqual([
            {
                clubKey: 'matrics',
                aliasText: 'MATRICS',
                source: 'playhq',
            },
        ]);
        expect(data.grades).toEqual([
            {
                seasonKey: 'amnd-winter-2025',
                gradeKey: 'amnd-winter-2025-a-grade',
                name: 'A GRADE',
                tier: 4,
                division: null,
                teamCount: 2,
                ageBand: 'Senior',
                playhqId: 'grade-playhq-id',
            },
        ]);
        expect(data.teams).toEqual([
            {
                clubKey: 'matrics',
                gradeKey: 'amnd-winter-2025-a-grade',
                displayName: 'Matrics',
                squadNumber: 1,
                playhqId: 'team-playhq-id',
            },
        ]);
        expect(data.results).toEqual([
            {
                gradeKey: 'amnd-winter-2025-a-grade',
                clubKey: 'matrics',
                squadNumber: 1,
                playhqId: 'team-playhq-id',
                displayName: 'Matrics',
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
                scrapedAt: 1_700_000_000_000,
            },
        ]);
    });
});
