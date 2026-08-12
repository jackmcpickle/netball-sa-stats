/**
 * The domain object for "every meeting between two clubs". Pure: the repo
 * hands it already-joined `GameFact`s and it folds them into a record, two
 * roll-ups and a meetings list, all from club A's perspective.
 *
 * Two rules here are load-bearing and are not obvious from the data:
 *
 * 1. A forfeit is a result but not a scoreline. PlayHQ fabricates 0–20 on
 *    forfeit rows (see `docs/playhq-api.md` §6), so goals are accumulated only
 *    for a `final`. Guarding on "both scores present" instead would put a
 *    phantom 20-goal margin into every differential.
 * 2. A meeting requires both sides. Byes are stored as rows with one null
 *    side, and a scheduled final can carry an undecided `ProvisionalTeam`;
 *    neither is a meeting between these two clubs.
 */
import { bandLabel } from '@/pipeline/scoring/bands';
import type {
    BandFilter,
    BandRecord,
    GameFact,
    HeadToHead,
    HeadToHeadRecord,
    Meeting,
    SeasonRecord,
} from '@/server/dto/head-to-head.dto';
import type { ClubKey } from '@/server/dto/shared.dto';

/** One meeting rotated so the "for" side is always club A. */
interface Sided {
    readonly fact: GameFact;
    readonly teamA: string | null;
    readonly teamB: string | null;
    readonly scoreA: number | null;
    readonly scoreB: number | null;
}

const RESULT_STATUSES = new Set(['final', 'forfeit']);

function isMeeting(fact: GameFact, a: ClubKey, b: ClubKey): boolean {
    if (a === b || fact.status === 'bye') {
        return false;
    }
    const { homeClubKey: home, awayClubKey: away } = fact;
    if (home === null || away === null) {
        return false;
    }
    return (home === a && away === b) || (home === b && away === a);
}

function toSided(fact: GameFact, a: ClubKey): Sided {
    const homeIsA = fact.homeClubKey === a;
    return {
        fact,
        teamA: homeIsA ? fact.homeTeamName : fact.awayTeamName,
        teamB: homeIsA ? fact.awayTeamName : fact.homeTeamName,
        scoreA: homeIsA ? fact.homeScore : fact.awayScore,
        scoreB: homeIsA ? fact.awayScore : fact.homeScore,
    };
}

function resultOf(sided: Sided): 'W' | 'L' | 'D' | null {
    if (!RESULT_STATUSES.has(sided.fact.status)) {
        return null;
    }
    const { scoreA, scoreB } = sided;
    if (scoreA === null || scoreB === null) {
        // A forfeit PlayHQ never scored. It counts as played but the winner
        // cannot be read off the scoreline, so `forfeitingSide` would be the
        // only source — and it is not on `GameFact`. Treat as no verdict.
        return null;
    }
    if (scoreA > scoreB) {
        return 'W';
    }
    return scoreA < scoreB ? 'L' : 'D';
}

function toMeeting(sided: Sided): Meeting {
    const { fact } = sided;
    return {
        year: fact.year,
        round: fact.round,
        roundName: fact.roundName,
        isFinals: fact.isFinals,
        playedAt: fact.playedAt,
        gradeName: fact.gradeName,
        teamA: sided.teamA,
        teamB: sided.teamB,
        scoreA: sided.scoreA,
        scoreB: sided.scoreB,
        status: fact.status,
        result: resultOf(sided),
    };
}

/** Newest season first, then latest round first within a season. */
function byRecency(left: Meeting, right: Meeting): number {
    if (left.year !== right.year) {
        return right.year - left.year;
    }
    return (right.round ?? 0) - (left.round ?? 0);
}

interface Tally {
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
}

function emptyTally(): Tally {
    return {
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
    };
}

function accumulate(tally: Tally, sided: Sided): void {
    const result = resultOf(sided);
    if (!RESULT_STATUSES.has(sided.fact.status)) {
        return;
    }
    tally.played += 1;
    if (result === 'W') {
        tally.won += 1;
    } else if (result === 'L') {
        tally.lost += 1;
    } else if (result === 'D') {
        tally.drawn += 1;
    }
    // Rule 1: goals come off played games only, never a fabricated forfeit.
    if (
        sided.fact.status === 'final' &&
        sided.scoreA !== null &&
        sided.scoreB !== null
    ) {
        tally.goalsFor += sided.scoreA;
        tally.goalsAgainst += sided.scoreB;
    }
}

function tallyBy<K>(
    sides: readonly Sided[],
    key: (sided: Sided) => K,
): Map<K, Tally> {
    const groups = new Map<K, Tally>();
    for (const sided of sides) {
        const group = groups.get(key(sided)) ?? emptyTally();
        accumulate(group, sided);
        groups.set(key(sided), group);
    }
    return groups;
}

function toRecord(tally: Tally): HeadToHeadRecord {
    return { ...tally };
}

function bySeasonFrom(sides: readonly Sided[]): readonly SeasonRecord[] {
    return [...tallyBy(sides, (sided) => sided.fact.year)]
        .sort(([left], [right]) => left - right)
        .map(([year, tally]) => ({
            year,
            played: tally.played,
            won: tally.won,
            drawn: tally.drawn,
            lost: tally.lost,
            goalDiff: tally.goalsFor - tally.goalsAgainst,
        }));
}

function byBandFrom(sides: readonly Sided[]): readonly BandRecord[] {
    return [...tallyBy(sides, (sided) => sided.fact.tier)]
        .sort(([left], [right]) => left - right)
        .map(([tier, tally]) => ({
            tier,
            label: bandLabel(tier),
            played: tally.played,
            won: tally.won,
            drawn: tally.drawn,
            lost: tally.lost,
        }));
}

export function buildHeadToHead(
    facts: readonly GameFact[],
    clubA: ClubKey,
    clubB: ClubKey,
    band: BandFilter,
): HeadToHead {
    const sides = facts
        .filter(
            (fact) =>
                isMeeting(fact, clubA, clubB) &&
                (band === 'all' || fact.tier === band),
        )
        .map((fact) => toSided(fact, clubA));

    const overall = emptyTally();
    for (const sided of sides) {
        accumulate(overall, sided);
    }

    return {
        record: toRecord(overall),
        bySeason: bySeasonFrom(sides),
        byBand: byBandFrom(sides),
        meetings: sides.map(toMeeting).sort(byRecency),
    };
}

export interface OpponentCount {
    readonly clubKey: ClubKey;
    readonly name: string;
    readonly played: number;
}

/**
 * Most-played opponents first. The name tiebreaker is not cosmetic: without
 * it, two opponents level on games played can swap between requests and the
 * "top five" list reshuffles on every reload.
 */
export function topOpponents(
    counts: readonly OpponentCount[],
): readonly OpponentCount[] {
    return [...counts].sort((left, right) =>
        left.played === right.played
            ? left.name.localeCompare(right.name)
            : right.played - left.played,
    );
}
