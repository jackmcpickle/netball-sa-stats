/**
 * Contracts for `/head-to-head`. `GameFact` is the repo→domain boundary: one
 * row of `games` already joined out to year, tier, grade name and both sides'
 * club keys, so the aggregator never touches drizzle.
 *
 * Team names and club keys are nullable because two real shapes produce them:
 * a bye is synthesised with only one side, and a scheduled final can carry
 * PlayHQ's `ProvisionalTeam` — an undecided side with no team behind it.
 */
import type { GameStatus } from '@/db/schema';
import type { Club, ClubKey } from '@/server/dto/shared.dto';

export interface GameFact {
    readonly year: number;
    readonly tier: number;
    readonly gradeName: string;
    /** Finals are shifted past the last regular round so they sort last. */
    readonly round: number | null;
    /** PlayHQ's own label, e.g. `Grand Final`. Shown instead of `round`. */
    readonly roundName: string | null;
    readonly isFinals: boolean;
    /** Epoch seconds, null when PlayHQ has no scheduled time. */
    readonly playedAt: number | null;
    readonly homeClubKey: ClubKey | null;
    readonly awayClubKey: ClubKey | null;
    readonly homeTeamName: string | null;
    readonly awayTeamName: string | null;
    readonly homeScore: number | null;
    readonly awayScore: number | null;
    readonly status: GameStatus;
}

/** Always from club A's perspective. */
export interface HeadToHeadRecord {
    readonly played: number;
    readonly won: number;
    readonly drawn: number;
    readonly lost: number;
    readonly goalsFor: number;
    readonly goalsAgainst: number;
}

export interface SeasonRecord {
    readonly year: number;
    readonly played: number;
    readonly won: number;
    readonly drawn: number;
    readonly lost: number;
    readonly goalDiff: number;
}

export interface BandRecord {
    readonly tier: number;
    readonly label: string;
    readonly played: number;
    readonly won: number;
    readonly drawn: number;
    readonly lost: number;
}

export interface Meeting {
    readonly year: number;
    readonly round: number | null;
    readonly roundName: string | null;
    readonly isFinals: boolean;
    readonly playedAt: number | null;
    readonly gradeName: string;
    readonly teamA: string | null;
    readonly teamB: string | null;
    readonly scoreA: number | null;
    readonly scoreB: number | null;
    readonly status: GameStatus;
    /** Null when the game produced no result (scheduled, no_result). */
    readonly result: 'W' | 'L' | 'D' | null;
}

export interface HeadToHead {
    readonly record: HeadToHeadRecord;
    readonly bySeason: readonly SeasonRecord[];
    readonly byBand: readonly BandRecord[];
    readonly meetings: readonly Meeting[];
}

/** A tier the pair has actually met in, so the picker offers nothing empty. */
export interface BandOption {
    readonly tier: number;
    readonly label: string;
}

/** `'all'` is the no-band-filter sentinel, not a tier. */
export type BandFilter = number | 'all';

export interface HeadToHeadParams {
    readonly a?: string;
    readonly b?: string;
    readonly band?: BandFilter;
    readonly includePast?: boolean;
    readonly sort?: string;
    readonly dir?: 'asc' | 'desc';
    readonly page?: number;
    readonly pageSize?: number;
}

export interface HeadToHeadPageDto {
    /** Options for both pickers, already filtered by `includePast`. */
    readonly clubs: readonly Club[];
    readonly includePast: boolean;
    readonly a: Club | null;
    readonly b: Club | null;
    readonly band: BandFilter;
    readonly bands: readonly BandOption[];
    /** Null until two distinct clubs are selected. */
    readonly h2h: HeadToHead | null;
}
