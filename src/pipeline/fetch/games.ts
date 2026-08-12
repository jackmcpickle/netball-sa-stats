import type { ForfeitSide, GameStatus } from '@/db/schema';
/**
 * Pure mapping from a `gradeAllRounds` response to `games` CSV rows. No
 * network, no filesystem — fixture-tested against the committed
 * `data/raw/probe/gradeAllRounds_*.json` captures.
 *
 * Shape and quirks are documented in `docs/playhq-api.md` §6. Two of them
 * drive most of this module: a bye is a round-level team list rather than a
 * game, and a forfeit carries a fabricated 0-20 scoreline.
 */
import type { CsvValue } from '@/pipeline/csv';

export type Statistic = { count: number; type: { value: string } };

export type SideResult = {
    outcome: { name: string; value: string } | null;
    statistics: readonly Statistic[];
    gameOutcomeDescription: string;
};

/**
 * `home`/`away` are a GraphQL union. A `DiscoverTeam` has an `id`; a
 * `ProvisionalTeam` — a finals slot whose team is not decided yet — has only
 * a name.
 */
export type FixtureTeam = {
    id?: string;
    name: string;
    organisation?: { id: string; name: string; type: string } | null;
};

export type FixtureGame = {
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
};

export type FixtureRound = {
    id: string;
    name: string;
    number: number | null;
    abbreviatedName: string | null;
    isFinalsRound: boolean;
    byes: readonly FixtureTeam[];
    games: readonly FixtureGame[];
};

export type GameRow = Record<string, CsvValue> & {
    grade_key: string;
    playhq_id: string;
    round: number | null;
    round_name: string | null;
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
    if (side === null) {
        return null;
    }
    const stat = side.statistics.find(
        (entry) => entry.type.value === SCORE_STATISTIC,
    );
    return stat?.count ?? null;
}

const FORFEIT_OUTCOMES: Record<string, ForfeitSide> = {
    HOME_TEAM_WON_BY_FORFEIT: 'away',
    AWAY_TEAM_WON_BY_FORFEIT: 'home',
    DOUBLE_FORFEIT: 'both',
};

const SCORE_OUTCOMES = new Set([
    'HOME_TEAM_WON_BY_SCORE',
    'AWAY_TEAM_WON_BY_SCORE',
    'DRAW_BY_SCORE',
]);

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
    if (game.result === null) {
        return {
            status: game.status.value === 'FINAL' ? 'no_result' : 'scheduled',
            forfeitingSide: null,
        };
    }

    const outcome = game.result.outcome?.value ?? null;
    if (outcome === null) {
        return { status: 'no_result', forfeitingSide: null };
    }

    const forfeitingSide = FORFEIT_OUTCOMES[outcome];
    if (forfeitingSide !== undefined) {
        return { status: 'forfeit', forfeitingSide };
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
    if (home === null || away === null) {
        return { status: 'no_result', forfeitingSide: null };
    }
    return { status: 'final', forfeitingSide: null };
}

const TIME_ZONE = 'Australia/Adelaide';

const ZONE_FORMAT = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
    if (date === null || date === '') {
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
    const regular = rounds.filter((round) => !round.isFinalsRound);
    const lastRegular = regular.reduce(
        (max, round) => Math.max(max, round.number ?? 0),
        0,
    );
    const numbers = new Map<string, number>();
    for (const round of rounds) {
        if (round.number === null) continue;
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
                grade_key: gradeKey,
                playhq_id: game.id,
                round: roundNumber,
                round_name: game.alias ?? round.name,
                played_at: playedAtEpoch(
                    game.date,
                    game.allocation?.time ?? null,
                ),
                home_playhq_id: teamId(game.home),
                away_playhq_id: teamId(game.away),
                home_score: scored ? scoreOf(game.result?.home ?? null) : null,
                away_score: scored ? scoreOf(game.result?.away ?? null) : null,
                status,
                forfeiting_side: forfeitingSide,
                source: 'playhq',
                scraped_at: scrapedAt,
            });
        }

        for (const team of round.byes) {
            rows.push({
                grade_key: gradeKey,
                playhq_id: `bye:${round.id}:${team.id ?? team.name}`,
                round: roundNumber,
                round_name: round.name,
                played_at: null,
                home_playhq_id: teamId(team),
                away_playhq_id: null,
                home_score: null,
                away_score: null,
                status: 'bye',
                forfeiting_side: null,
                source: 'playhq',
                scraped_at: scrapedAt,
            });
        }
    }

    return rows;
}
