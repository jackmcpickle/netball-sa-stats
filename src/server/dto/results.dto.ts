/**
 * Contracts for `/results` — one season+grade's fixture list. Distinct from
 * `src/db/queries/results.ts`, which is the *ladder* results query and has
 * nothing to do with fixtures.
 */
import type { TableState } from '@/db/queries/pagination';
import type { GameStatus } from '@/db/schema';
import type { ClubKey, GradeSummary } from '@/server/dto/shared.dto';

export type ResultRow = {
    /** Finals are shifted past the last regular round so they sort last. */
    readonly round: number | null;
    /** PlayHQ's own label. Shown instead of `round` when `isFinals`. */
    readonly roundName: string | null;
    readonly isFinals: boolean;
    /** Epoch seconds, null when PlayHQ has no scheduled time. */
    readonly playedAt: number | null;
    /** Null for a bye's empty side, or an undecided finalist. */
    readonly homeTeamName: string | null;
    readonly awayTeamName: string | null;
    readonly homeClubKey: ClubKey | null;
    readonly awayClubKey: ClubKey | null;
    readonly homeScore: number | null;
    readonly awayScore: number | null;
    /** Null whenever the scoreline is absent or fabricated. */
    readonly margin: number | null;
    readonly status: GameStatus;
    /** True when the row can link to a two-club head-to-head. */
    readonly canCompare: boolean;
};

export type ResultsParams = {
    readonly year?: number;
    readonly grade?: string;
    readonly sort?: string;
    readonly dir?: 'asc' | 'desc';
    readonly page?: number;
    readonly pageSize?: number;
};

export type FixtureListDto = {
    readonly grade: GradeSummary;
    readonly rows: readonly ResultRow[];
    readonly totalRows: number;
    readonly tableState: TableState;
};

export type ResultsPageDto = {
    readonly years: readonly number[];
    /** Null only for a genuinely empty dataset. */
    readonly year: number | null;
    readonly grades: readonly GradeSummary[];
    /** Null when the season has no grades, or the grade has no fixtures. */
    readonly fixtures: FixtureListDto | null;
};
