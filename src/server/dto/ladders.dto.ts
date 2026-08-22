import type { TableState } from '@/db/queries/pagination';
import type { Club, Competition, GradeSummary } from '@/server/dto/shared.dto';

export interface LadderRow {
    readonly position: number;
    readonly club: Club;
    /** Includes the squad number where a club fields more than one team. */
    readonly displayName: string;
    readonly played: number | null;
    readonly won: number | null;
    readonly lost: number | null;
    readonly drawn: number | null;
    readonly goalsFor: number | null;
    readonly goalsAgainst: number | null;
    readonly percentage: number | null;
    readonly points: number | null;
    /** Provenance note, e.g. PlayHQ's played count not reconciling with W+D+L. */
    readonly notes: string | null;
}

export interface LadderDto {
    readonly grade: GradeSummary;
    readonly rows: readonly LadderRow[];
    readonly totalRows: number;
    readonly tableState: TableState;
}

export interface LaddersParams {
    readonly year?: number;
    readonly grade?: string;
    readonly competition?: string;
    readonly sort?: string;
    readonly dir?: 'asc' | 'desc';
    readonly page?: number;
    readonly pageSize?: number;
}

export interface LaddersPageDto {
    readonly years: readonly number[];
    /** Null only for a genuinely empty dataset — see `Coverage.resolveYear`. */
    readonly year: number | null;
    readonly grades: readonly GradeSummary[];
    readonly ladder: LadderDto | null;
    readonly competitions: readonly Competition[];
    readonly competition: Competition | null;
}
