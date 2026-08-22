import { isNull, isUndefined } from 'es-toolkit';
import type { ForfeitSide, GameStatus } from '@/db/schema';
/**
 * Pure mapping from a `gradeAllRounds` response to `games` CSV rows. No
 * network, no filesystem — fixture-tested against handmade rounds in
 * `games.test.ts`.
 *
 * Shape and quirks are documented in `docs/playhq-api.md` §6. Two of them
 * drive most of this module: a bye is a round-level team list rather than a
 * game, and a forfeit carries a fabricated 0-20 scoreline.
 */
import type { CsvValue } from '@/pipeline/csv';

export interface Statistic {
    count: number;
    type: { value: string };
}

export interface SideResult {
    outcome: { name: string; value: string } | null;
    statistics: readonly Statistic[];
    gameOutcomeDescription: string;
}

/**
 * `home`/`away` are a GraphQL union. A `DiscoverTeam` has an `id`; a
 * `ProvisionalTeam` — a finals slot whose team is not decided yet — has only
 * a name.
 */
export interface FixtureTeam {
    id?: string;
    name: string;
    organisation?: { id: string; name: string; type: string } | null;
}

export interface FixtureGame {
    id: string;
    alias: string | null;
    pool: { id: string; name: string } | null;
    home: FixtureTeam | null;
    away: FixtureTeam | null;
    result: {
        winner: { name: string; value: string } | null;
        outcome: { name: string; value: string } | null;
        home: SideResult | null;
        away: SideResult | null;
    } | null;
    status: { name: string; value: string };
    date: string | null;
    dates: readonly string[] | null;
    allocation: {
        time: string | null;
        court?: unknown;
    } | null;
}

export interface FixtureRound {
    id: string;
    name: string;
    number: number | null;
    abbreviatedName: string | null;
    isFinalsRound: boolean;
    byes: readonly FixtureTeam[];
    games: readonly FixtureGame[];
}

export type GameRow = Record<string, CsvValue> & {
    grade_key: string;
    playhq_id: string;
    round: number | null;
    round_name: string | null;
    is_finals: number;
    played_at: number | null;
    home_playhq_id: string | null;
    away_playhq_id: string | null;
    home_score: number | null;
    away_score: number | null;
    status: GameStatus;
    forfeiting_side: ForfeitSide | null;
    source: 'playhq';
    scraped_at: number;
};

const SCORE_STATISTIC = 'TOTAL_SCORE';

/** Netball's only statistic type, and it arrives as an array, not a field. */
export function scoreOf(side: SideResult | null): number | null {
    if (isNull(side)) {
        return null;
    }
    const stat = side.statistics.find(
        (entry) => entry.type.value === SCORE_STATISTIC,
    );
    return stat?.count ?? null;
}

// A `Map` rather than an object literal because the lookup key is PlayHQ's
// arbitrary outcome string, not one of these three known keys.
const FORFEIT_OUTCOMES = new Map<string, ForfeitSide>(
    Object.entries({
        AWAY_TEAM_WON_BY_FORFEIT: 'home',
        DOUBLE_FORFEIT: 'both',
        HOME_TEAM_WON_BY_FORFEIT: 'away',
    } satisfies Record<string, ForfeitSide>),
);

const SCORE_OUTCOMES = new Set([
    'HOME_TEAM_WON_BY_SCORE',
    'AWAY_TEAM_WON_BY_SCORE',
    'DRAW_BY_SCORE',
]);

/**
 * Outcomes where the game did not produce a result. `CANCELLED` carries a
 * fabricated 0-0 scoreline, so it must be recognised explicitly — treating it
 * as a scored draw would invent a 0-0 in both clubs' records.
 */
const NO_RESULT_OUTCOMES = new Set(['CANCELLED', 'ABANDONED']);

/**
 * Only `UPCOMING` is genuinely a future fixture. `PENDING` is a game whose
 * date has passed but whose score was never entered — calling that
 * "scheduled" would put finished games in the upcoming list forever.
 */
// See `FORFEIT_OUTCOMES` on why this is a `Map`.
const UNPLAYED_STATUSES = new Map<string, GameStatus>(
    Object.entries({
        CANCELLED: 'no_result',
        FINAL: 'no_result',
        IN_PROGRESS: 'scheduled',
        PENDING: 'no_result',
        UPCOMING: 'scheduled',
    } satisfies Record<string, GameStatus>),
);

export interface GameClassification {
    readonly status: GameStatus;
    readonly forfeitingSide: ForfeitSide | null;
}

/**
 * Derives `status` from the outcome enum, in the order forfeit → played →
 * unplayed. An unrecognised outcome throws: PlayHQ's own client-side enum
 * does not list the `*_BY_SCORE` values every real response returns, so it is
 * no guide to what the server can send, and quietly treating an unknown
 * outcome as a normal win is exactly how a forfeit's fake 0-20 scoreline ends
 * up in a club's goal differential.
 */
export function classifyGame(game: FixtureGame): GameClassification {
    if (isNull(game.result)) {
        const status = UNPLAYED_STATUSES.get(game.status.value);
        if (isUndefined(status)) {
            throw new Error(
                `Unrecognised PlayHQ game status "${game.status.value}" on game ${game.id}. ` +
                    'Add it to games.ts and document it in docs/playhq-api.md §6.',
            );
        }
        return { forfeitingSide: null, status };
    }

    const outcome = game.result.outcome?.value ?? null;
    if (isNull(outcome) || NO_RESULT_OUTCOMES.has(outcome)) {
        return { forfeitingSide: null, status: 'no_result' };
    }

    const forfeitingSide = FORFEIT_OUTCOMES.get(outcome);
    if (!isUndefined(forfeitingSide)) {
        return { forfeitingSide, status: 'forfeit' };
    }

    if (!SCORE_OUTCOMES.has(outcome)) {
        throw new Error(
            `Unrecognised PlayHQ game outcome "${outcome}" on game ${game.id}. ` +
                'Add it to games.ts and document it in docs/playhq-api.md §6.',
        );
    }

    // A scored outcome with a missing score is not a 0: it is a game whose
    // result PlayHQ never recorded.
    const home = scoreOf(game.result.home);
    const away = scoreOf(game.result.away);
    if (isNull(home) || isNull(away)) {
        return { forfeitingSide: null, status: 'no_result' };
    }
    return { forfeitingSide: null, status: 'final' };
}

const TIME_ZONE = 'Australia/Adelaide';

const ZONE_FORMAT = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: TIME_ZONE,
    year: 'numeric',
});

function partValue(
    parts: readonly Intl.DateTimeFormatPart[],
    type: string,
): number {
    return Number(parts.find((part) => part.type === type)?.value ?? '0');
}

function zoneOffsetMs(instant: number): number {
    const parts = ZONE_FORMAT.formatToParts(new Date(instant));
    const asUtc = Date.UTC(
        partValue(parts, 'year'),
        partValue(parts, 'month') - 1,
        partValue(parts, 'day'),
        // `hour12: false` can render midnight as 24, which Date.UTC would
        // roll into the next day.
        partValue(parts, 'hour') % 24,
        partValue(parts, 'minute'),
        partValue(parts, 'second'),
    );
    return asUtc - instant;
}

/**
 * PlayHQ reports wall-clock date and time with no offset, so they are read as
 * Adelaide local. A fixed offset would be an hour out for half the year, and
 * the site shows dates — a 23:30 game would show on the wrong day.
 *
 * Two passes: guess the offset at the naive instant, then re-derive it at the
 * corrected one, which settles any DST-boundary disagreement.
 */
export function playedAtEpoch(
    date: string | null,
    time: string | null,
): number | null {
    if (isNull(date) || date === '') {
        return null;
    }
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute, second] = (time ?? '00:00:00').split(':').map(Number);
    const naive = Date.UTC(year, month - 1, day, hour, minute, second);
    const firstPass = naive - zoneOffsetMs(naive);
    const utc = naive - zoneOffsetMs(firstPass);
    return Math.floor(utc / 1000);
}

function teamId(team: FixtureTeam | null): string | null {
    return team?.id ?? null;
}

/**
 * PlayHQ restarts round numbering at 1 for finals, so a grade has two
 * "round 1"s — the season opener and the first final. Finals are shifted past
 * the last regular round so `round` sorts chronologically and identifies a
 * round uniquely within a grade. `roundName` keeps PlayHQ's own label, so
 * nothing user-facing shows the shifted number.
 */
function roundNumbers(rounds: readonly FixtureRound[]): Map<string, number> {
    let lastRegular = 0;
    for (const round of rounds) {
        if (!round.isFinalsRound) {
            lastRegular = Math.max(lastRegular, round.number ?? 0);
        }
    }
    const numbers = new Map<string, number>();
    for (const round of rounds) {
        if (isNull(round.number)) {
            continue;
        }
        numbers.set(
            round.id,
            round.isFinalsRound ? lastRegular + round.number : round.number,
        );
    }
    return numbers;
}

/**
 * Flattens rounds to CSV rows, synthesising one row per bye team. Bye rows
 * take a composite `bye:<round>:<team>` id because PlayHQ gives them no game
 * id of their own — it is stable across re-scrapes, which is all the
 * `(grade, playhq_id)` unique index needs.
 *
 * Rows carry PlayHQ team ids, not club keys: stage 2 resolves them against
 * `teams.playhq_id`, which is where team identity already lives.
 */
export function toGameRows(
    rounds: readonly FixtureRound[],
    gradeKey: string,
    scrapedAt: number,
): readonly GameRow[] {
    const rows: GameRow[] = [];
    const numbers = roundNumbers(rounds);

    for (const round of rounds) {
        const roundNumber = numbers.get(round.id) ?? round.number;
        for (const game of round.games) {
            const { status, forfeitingSide } = classifyGame(game);
            const scored = status === 'final' || status === 'forfeit';
            rows.push({
                away_playhq_id: teamId(game.away),
                away_score: scored ? scoreOf(game.result?.away ?? null) : null,
                forfeiting_side: forfeitingSide,
                grade_key: gradeKey,
                home_playhq_id: teamId(game.home),
                home_score: scored ? scoreOf(game.result?.home ?? null) : null,
                is_finals: round.isFinalsRound ? 1 : 0,
                played_at: playedAtEpoch(
                    game.date,
                    game.allocation?.time ?? null,
                ),
                playhq_id: game.id,
                round: roundNumber,
                round_name: game.alias ?? round.name,
                scraped_at: scrapedAt,
                source: 'playhq',
                status,
            });
        }

        for (const team of round.byes) {
            rows.push({
                away_playhq_id: null,
                away_score: null,
                forfeiting_side: null,
                grade_key: gradeKey,
                home_playhq_id: teamId(team),
                home_score: null,
                is_finals: round.isFinalsRound ? 1 : 0,
                played_at: null,
                playhq_id: `bye:${round.id}:${team.id ?? team.name}`,
                round: roundNumber,
                round_name: round.name,
                scraped_at: scrapedAt,
                source: 'playhq',
                status: 'bye',
            });
        }
    }

    return rows;
}
