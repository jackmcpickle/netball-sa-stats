import { isNull } from 'es-toolkit';
import { describe, expect, it } from 'vitest';
import {
    classifyGame,
    playedAtEpoch,
    scoreOf,
    toGameRows,
} from '@/pipeline/fetch/games';
import type {
    FixtureGame,
    FixtureRound,
    FixtureTeam,
} from '@/pipeline/fetch/games';

function game(overrides: Partial<FixtureGame>): FixtureGame {
    return {
        alias: null,
        allocation: null,
        away: { id: 't2', name: 'Away', organisation: null },
        date: '2026-04-10',
        dates: ['2026-04-10'],
        home: { id: 't1', name: 'Home', organisation: null },
        id: 'g1',
        pool: null,
        result: null,
        status: { name: 'Upcoming', value: 'UPCOMING' },
        ...overrides,
    };
}

function result(outcome: string, home: number, away: number): FixtureGame {
    return game({
        result: {
            away: {
                gameOutcomeDescription: '',
                outcome: null,
                statistics: [{ count: away, type: { value: 'TOTAL_SCORE' } }],
            },
            home: {
                gameOutcomeDescription: '',
                outcome: null,
                statistics: [{ count: home, type: { value: 'TOTAL_SCORE' } }],
            },
            outcome: { name: outcome, value: outcome },
            winner: null,
        },
        status: { name: 'Final', value: 'FINAL' },
    });
}

describe(scoreOf, () => {
    it('reads the TOTAL_SCORE statistic rather than a scalar field', () => {
        expect(
            scoreOf({
                gameOutcomeDescription: '',
                outcome: null,
                statistics: [{ count: 49, type: { value: 'TOTAL_SCORE' } }],
            }),
        ).toBe(49);
    });

    it('is null when no TOTAL_SCORE statistic is present', () => {
        expect(
            scoreOf({
                gameOutcomeDescription: '',
                outcome: null,
                statistics: [{ count: 3, type: { value: 'SOMETHING_ELSE' } }],
            }),
        ).toBeNull();
    });

    it('is null for an absent side', () => {
        expect(scoreOf(null)).toBeNull();
    });
});

describe(classifyGame, () => {
    it('is final when a side won by score', () => {
        expect(
            classifyGame(result('HOME_TEAM_WON_BY_SCORE', 45, 32)),
        ).toStrictEqual({
            forfeitingSide: null,
            status: 'final',
        });
    });

    it('is final for a draw', () => {
        expect(classifyGame(result('DRAW_BY_SCORE', 48, 48))).toStrictEqual({
            forfeitingSide: null,
            status: 'final',
        });
    });

    it('records the home side as forfeiting when the away team won by forfeit', () => {
        expect(
            classifyGame(result('AWAY_TEAM_WON_BY_FORFEIT', 0, 20)),
        ).toStrictEqual({ forfeitingSide: 'home', status: 'forfeit' });
    });

    it('records the away side as forfeiting when the home team won by forfeit', () => {
        expect(
            classifyGame(result('HOME_TEAM_WON_BY_FORFEIT', 20, 0)),
        ).toStrictEqual({ forfeitingSide: 'away', status: 'forfeit' });
    });

    it('records both sides for a double forfeit', () => {
        expect(classifyGame(result('DOUBLE_FORFEIT', 0, 0))).toStrictEqual({
            forfeitingSide: 'both',
            status: 'forfeit',
        });
    });

    it('is scheduled when the game is upcoming with no result', () => {
        expect(classifyGame(game({}))).toStrictEqual({
            forfeitingSide: null,
            status: 'scheduled',
        });
    });

    it('is no_result when a finished game carries no result', () => {
        expect(
            classifyGame(game({ status: { name: 'Final', value: 'FINAL' } })),
        ).toStrictEqual({ forfeitingSide: null, status: 'no_result' });
    });

    it('is no_result when a finished game is missing a score', () => {
        const missing = game({
            result: {
                away: {
                    gameOutcomeDescription: '',
                    outcome: null,
                    statistics: [],
                },
                home: {
                    gameOutcomeDescription: '',
                    outcome: null,
                    statistics: [{ count: 40, type: { value: 'TOTAL_SCORE' } }],
                },
                outcome: {
                    name: 'HOME_TEAM_WON_BY_SCORE',
                    value: 'HOME_TEAM_WON_BY_SCORE',
                },
                winner: null,
            },
            status: { name: 'Final', value: 'FINAL' },
        });
        expect(classifyGame(missing)).toStrictEqual({
            forfeitingSide: null,
            status: 'no_result',
        });
    });

    it('is no_result for a cancelled game, ignoring its fake 0-0', () => {
        // Real capture: game 255b6f94 comes back CANCELLED with a 0-0
        // TOTAL_SCORE on both sides. Scored as a draw it would invent a 0-0
        // in two clubs' records.
        expect(classifyGame(result('CANCELLED', 0, 0))).toStrictEqual({
            forfeitingSide: null,
            status: 'no_result',
        });
    });

    it('is no_result for a pending game, which has already been played', () => {
        // PENDING means the date has passed but no score was entered.
        expect(
            classifyGame(
                game({ status: { name: 'Pending', value: 'PENDING' } }),
            ),
        ).toStrictEqual({ forfeitingSide: null, status: 'no_result' });
    });

    it('throws on an unrecognised status rather than guessing', () => {
        expect(() =>
            classifyGame(
                game({ status: { name: 'Eh', value: 'TIME_TRAVELLING' } }),
            ),
        ).toThrow(/TIME_TRAVELLING/u);
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

function playedGame(
    id: string,
    homeScore: number,
    awayScore: number,
    alias: string | null = null,
): FixtureGame {
    return {
        ...result('HOME_TEAM_WON_BY_SCORE', homeScore, awayScore),
        alias,
        id,
    };
}

function upcomingGame(id: string): FixtureGame {
    return game({ id });
}

function fixtureRound(
    id: string,
    number: number,
    name: string,
    games: FixtureGame[],
    options: { finals?: boolean; byes?: readonly FixtureTeam[] } = {},
): FixtureRound {
    return {
        abbreviatedName: name,
        byes: options.byes ?? [],
        games,
        id,
        isFinalsRound: options.finals ?? false,
        name,
        number,
    };
}

const midRounds: FixtureRound[] = Array.from({ length: 12 }, (_, index) => {
    const number = index + 2;
    return fixtureRound(
        `r${String(number)}`,
        number,
        `Round ${String(number)}`,
        [playedGame(`mid-${String(number)}`, 40, 30)],
    );
});

const premier: FixtureRound[] = [
    fixtureRound('r1', 1, 'Round 1', [
        playedGame('p1', 50, 40),
        playedGame('p2', 48, 41),
        playedGame('p3', 39, 38),
        playedGame('p4', 55, 30),
    ]),
    ...midRounds,
    fixtureRound('r14', 14, 'Round 14', [
        upcomingGame('u1'),
        upcomingGame('u2'),
        upcomingGame('u3'),
        upcomingGame('u4'),
    ]),
    fixtureRound(
        'f1',
        1,
        'Finals Round 1',
        [playedGame('pf', 45, 40, 'Preliminary Final')],
        { finals: true },
    ),
    fixtureRound('f3', 3, 'Finals', [playedGame('gf', 50, 42, 'Grand Final')], {
        finals: true,
    }),
];

const reserves: FixtureRound[] = [
    fixtureRound('rr1', 1, 'Round 1', [playedGame('rg1', 40, 30)], {
        byes: [{ id: 'bye-team', name: 'Bye Club', organisation: null }],
    }),
];

const draws: FixtureRound[] = [
    fixtureRound('dr1', 1, 'Round 1', [
        { ...result('DRAW_BY_SCORE', 40, 40), id: 'd1' },
        { ...result('DRAW_BY_SCORE', 35, 35), id: 'd2' },
        { ...result('DRAW_BY_SCORE', 48, 48), id: 'd3' },
    ]),
];

const forfeit: FixtureRound[] = [
    fixtureRound('fr1', 1, 'Round 1', [
        { ...result('AWAY_TEAM_WON_BY_FORFEIT', 0, 20), id: 'forfeit-1' },
    ]),
];

describe(playedAtEpoch, () => {
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

describe(toGameRows, () => {
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
        expect(played.every((row) => !isNull(row.home_playhq_id))).toBeTruthy();
        expect(played.every((row) => !isNull(row.away_playhq_id))).toBeTruthy();
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

    it('flags finals, so they can be excluded when reconciling against a ladder', () => {
        // A ladder is the regular season only. Without this flag, every
        // finalist looks like it won more games than the ladder credits.
        const rows = toGameRows(premier, 'premier-2026', 1);
        const finals = rows.filter((row) => row.is_finals === 1);
        const expected = premier
            .filter((round) => round.isFinalsRound)
            .flatMap((round) => round.games).length;
        expect(finals).toHaveLength(expected);
        expect(finals.length).toBeGreaterThan(0);
        expect(
            rows.find((row) => row.round_name === 'Round 1')?.is_finals,
        ).toBe(0);
    });

    it('names a finals game by its alias rather than the round', () => {
        const rows = toGameRows(premier, 'premier-2026', 1);
        expect(
            rows.some((row) => row.round_name === 'Preliminary Final'),
        ).toBeTruthy();
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
        expect(byes.every((row) => isNull(row.away_playhq_id))).toBeTruthy();
        expect(byes.every((row) => !isNull(row.home_playhq_id))).toBeTruthy();
        expect(byes.every((row) => isNull(row.home_score))).toBeTruthy();
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
        expect(scheduled.every((row) => isNull(row.home_score))).toBeTruthy();
    });

    it('leaves an unqualified finals side null rather than inventing a team', () => {
        // A ProvisionalTeam has a name but no id, so there is nothing to
        // resolve against `teams.playhq_id`.
        const rows = toGameRows(
            [
                {
                    abbreviatedName: 'F',
                    byes: [],
                    games: [
                        game({
                            away: { name: 'Winner SF1' },
                            id: 'gf',
                        }),
                    ],
                    id: 'r1',
                    isFinalsRound: true,
                    name: 'Finals',
                    number: 18,
                },
            ],
            'premier-2026',
            1,
        );
        expect(rows[0].away_playhq_id).toBeNull();
        expect(rows[0].status).toBe('scheduled');
    });
});
