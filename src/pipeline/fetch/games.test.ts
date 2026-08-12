import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    classifyGame,
    playedAtEpoch,
    scoreOf,
    toGameRows,
    type FixtureGame,
    type FixtureRound,
} from '@/pipeline/fetch/games';

function capture(name: string): readonly FixtureRound[] {
    const parsed = JSON.parse(
        readFileSync(`data/raw/probe/${name}.json`, 'utf8'),
    ) as { data: { discoverGradeFixture: readonly FixtureRound[] } };
    return parsed.data.discoverGradeFixture;
}

const premier = capture('gradeAllRounds_premier_2026_a95c2301');
const reserves = capture('gradeAllRounds_reserves_2026_byes_ae6df43a');
const draws = capture('gradeAllRounds_amnd_agrade_2026_draws_98973113');
const forfeit = capture('gradeAllRounds_amnd_junior8_2024_forfeit_3723a749');

function game(overrides: Partial<FixtureGame>): FixtureGame {
    return {
        id: 'g1',
        alias: null,
        pool: null,
        home: { id: 't1', name: 'Home', organisation: null },
        away: { id: 't2', name: 'Away', organisation: null },
        result: null,
        status: { name: 'Upcoming', value: 'UPCOMING' },
        date: '2026-04-10',
        dates: ['2026-04-10'],
        allocation: null,
        ...overrides,
    };
}

function result(outcome: string, home: number, away: number): FixtureGame {
    return game({
        status: { name: 'Final', value: 'FINAL' },
        result: {
            winner: null,
            outcome: { name: outcome, value: outcome },
            home: {
                outcome: null,
                statistics: [{ count: home, type: { value: 'TOTAL_SCORE' } }],
                gameOutcomeDescription: '',
            },
            away: {
                outcome: null,
                statistics: [{ count: away, type: { value: 'TOTAL_SCORE' } }],
                gameOutcomeDescription: '',
            },
        },
    });
}

describe('scoreOf', () => {
    it('reads the TOTAL_SCORE statistic rather than a scalar field', () => {
        expect(
            scoreOf({
                outcome: null,
                statistics: [{ count: 49, type: { value: 'TOTAL_SCORE' } }],
                gameOutcomeDescription: '',
            }),
        ).toBe(49);
    });

    it('is null when no TOTAL_SCORE statistic is present', () => {
        expect(
            scoreOf({
                outcome: null,
                statistics: [{ count: 3, type: { value: 'SOMETHING_ELSE' } }],
                gameOutcomeDescription: '',
            }),
        ).toBeNull();
    });

    it('is null for an absent side', () => {
        expect(scoreOf(null)).toBeNull();
    });
});

describe('classifyGame', () => {
    it('is final when a side won by score', () => {
        expect(classifyGame(result('HOME_TEAM_WON_BY_SCORE', 45, 32))).toEqual({
            status: 'final',
            forfeitingSide: null,
        });
    });

    it('is final for a draw', () => {
        expect(classifyGame(result('DRAW_BY_SCORE', 48, 48))).toEqual({
            status: 'final',
            forfeitingSide: null,
        });
    });

    it('records the home side as forfeiting when the away team won by forfeit', () => {
        expect(classifyGame(result('AWAY_TEAM_WON_BY_FORFEIT', 0, 20))).toEqual(
            { status: 'forfeit', forfeitingSide: 'home' },
        );
    });

    it('records the away side as forfeiting when the home team won by forfeit', () => {
        expect(classifyGame(result('HOME_TEAM_WON_BY_FORFEIT', 20, 0))).toEqual(
            { status: 'forfeit', forfeitingSide: 'away' },
        );
    });

    it('records both sides for a double forfeit', () => {
        expect(classifyGame(result('DOUBLE_FORFEIT', 0, 0))).toEqual({
            status: 'forfeit',
            forfeitingSide: 'both',
        });
    });

    it('is scheduled when the game is upcoming with no result', () => {
        expect(classifyGame(game({}))).toEqual({
            status: 'scheduled',
            forfeitingSide: null,
        });
    });

    it('is no_result when a finished game carries no result', () => {
        expect(
            classifyGame(game({ status: { name: 'Final', value: 'FINAL' } })),
        ).toEqual({ status: 'no_result', forfeitingSide: null });
    });

    it('is no_result when a finished game is missing a score', () => {
        const missing = game({
            status: { name: 'Final', value: 'FINAL' },
            result: {
                winner: null,
                outcome: {
                    name: 'HOME_TEAM_WON_BY_SCORE',
                    value: 'HOME_TEAM_WON_BY_SCORE',
                },
                home: {
                    outcome: null,
                    statistics: [{ count: 40, type: { value: 'TOTAL_SCORE' } }],
                    gameOutcomeDescription: '',
                },
                away: {
                    outcome: null,
                    statistics: [],
                    gameOutcomeDescription: '',
                },
            },
        });
        expect(classifyGame(missing)).toEqual({
            status: 'no_result',
            forfeitingSide: null,
        });
    });

    it('throws on an unrecognised outcome rather than guessing', () => {
        // PlayHQ's client-side enum is not exhaustive of what the server
        // sends, so an unknown value means the mapping is out of date.
        // Defaulting it would score a forfeit as a normal 0-20 win.
        expect(() => classifyGame(result('WON_BY_MOON_PHASE', 1, 2))).toThrow(
            /WON_BY_MOON_PHASE/u,
        );
    });
});

describe('playedAtEpoch', () => {
    it('reads a date and time as Adelaide local time', () => {
        // 2026-04-10 19:00 ACST (UTC+9:30) === 09:30 UTC.
        expect(playedAtEpoch('2026-04-10', '19:00:00')).toBe(
            Date.UTC(2026, 3, 10, 9, 30) / 1000,
        );
    });

    it('handles daylight saving, where a fixed offset would be an hour out', () => {
        // 2025-12-06 10:00 ACDT (UTC+10:30) === 23:30 UTC the day before.
        expect(playedAtEpoch('2025-12-06', '10:00:00')).toBe(
            Date.UTC(2025, 11, 5, 23, 30) / 1000,
        );
    });

    it('falls back to midnight when only a date is known', () => {
        expect(playedAtEpoch('2026-04-10', null)).toBe(
            Date.UTC(2026, 3, 9, 14, 30) / 1000,
        );
    });

    it('is null with no date at all', () => {
        expect(playedAtEpoch(null, '19:00:00')).toBeNull();
    });
});

describe('toGameRows', () => {
    it('maps every game in the capture without losing one', () => {
        const games = premier.flatMap((round) => round.games);
        const rows = toGameRows(premier, 'premier-2026', 1_770_000_000);
        expect(rows.filter((row) => row.status !== 'bye')).toHaveLength(
            games.length,
        );
        expect(rows[0].grade_key).toBe('premier-2026');
        expect(rows[0].source).toBe('playhq');
        expect(rows[0].scraped_at).toBe(1_770_000_000);
    });

    it('carries playhq team ids through untouched for played games', () => {
        const rows = toGameRows(premier, 'premier-2026', 1);
        const played = rows.filter((row) => row.status === 'final');
        expect(played.length).toBeGreaterThan(0);
        expect(played.every((row) => row.home_playhq_id !== null)).toBe(true);
        expect(played.every((row) => row.away_playhq_id !== null)).toBe(true);
    });

    it('never emits two rows with the same playhq id', () => {
        for (const [name, rounds] of [
            ['premier', premier],
            ['reserves', reserves],
            ['draws', draws],
            ['forfeit', forfeit],
        ] as const) {
            const rows = toGameRows(rounds, `${name}-grade`, 1);
            expect(new Set(rows.map((row) => row.playhq_id)).size).toBe(
                rows.length,
            );
        }
    });

    it('carries the round number and name', () => {
        const rows = toGameRows(premier, 'premier-2026', 1);
        expect(rows[0].round).toBe(1);
        expect(rows[0].round_name).toBe('Round 1');
    });

    it('shifts finals past the last regular round', () => {
        // PlayHQ restarts finals numbering at 1, so the capture has both a
        // "Round 1" and a "Finals Round 1". Left alone, the semi final sorts
        // in among the season opener.
        const rows = toGameRows(premier, 'premier-2026', 1);
        const regular = premier.filter((round) => !round.isFinalsRound).length;
        const grandFinal = rows.find((row) => row.round_name === 'Grand Final');
        expect(regular).toBe(14);
        expect(grandFinal?.round).toBe(17);
        expect(
            rows.filter((row) => row.round === 1 && row.status !== 'bye'),
        ).toHaveLength(4);
    });

    it('names a finals game by its alias rather than the round', () => {
        const rows = toGameRows(premier, 'premier-2026', 1);
        expect(rows.some((row) => row.round_name === 'Preliminary Final')).toBe(
            true,
        );
    });

    it('synthesises a one-sided row for each bye team', () => {
        // PlayHQ returns byes as a round-level team list, not as games, so
        // without this the ladder's `byes` count has nothing to reconcile
        // against.
        const rows = toGameRows(reserves, 'reserves-2026', 1);
        const byes = rows.filter((row) => row.status === 'bye');
        const expected = reserves.flatMap((round) => round.byes);
        expect(byes).toHaveLength(expected.length);
        expect(byes.length).toBeGreaterThan(0);
        expect(byes.every((row) => row.away_playhq_id === null)).toBe(true);
        expect(byes.every((row) => row.home_playhq_id !== null)).toBe(true);
        expect(byes.every((row) => row.home_score === null)).toBe(true);
    });

    it('finds the forfeit in the junior 8 capture and attributes the side', () => {
        const rows = toGameRows(forfeit, 'junior-8-2024', 1);
        const forfeits = rows.filter((row) => row.status === 'forfeit');
        expect(forfeits).toHaveLength(1);
        expect(forfeits[0].forfeiting_side).toBe('home');
        expect(forfeits[0].home_score).toBe(0);
        expect(forfeits[0].away_score).toBe(20);
    });

    it('maps draws as finals with equal scores', () => {
        const rows = toGameRows(draws, 'amnd-a-2026', 1);
        const drawn = rows.filter(
            (row) =>
                row.status === 'final' && row.home_score === row.away_score,
        );
        expect(drawn).toHaveLength(3);
    });

    it('emits scheduled rows with null scores for upcoming games', () => {
        const rows = toGameRows(premier, 'premier-2026', 1);
        const scheduled = rows.filter((row) => row.status === 'scheduled');
        expect(scheduled).toHaveLength(4);
        expect(scheduled.every((row) => row.home_score === null)).toBe(true);
    });

    it('leaves an unqualified finals side null rather than inventing a team', () => {
        // A ProvisionalTeam has a name but no id, so there is nothing to
        // resolve against `teams.playhq_id`.
        const rows = toGameRows(
            [
                {
                    id: 'r1',
                    name: 'Finals',
                    number: 18,
                    abbreviatedName: 'F',
                    isFinalsRound: true,
                    byes: [],
                    games: [
                        game({
                            id: 'gf',
                            away: { name: 'Winner SF1' },
                        }),
                    ],
                },
            ],
            'premier-2026',
            1,
        );
        expect(rows[0].away_playhq_id).toBeNull();
        expect(rows[0].status).toBe('scheduled');
    });
});
