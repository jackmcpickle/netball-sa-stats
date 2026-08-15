import type { Coverage } from '@/server/dto/shared.dto';

/** A row of the published weighting table on the Method page. */
export interface GradeWeightRow {
    readonly competitionName: string;
    readonly label: string;
    readonly tier: number;
    readonly division: number | null;
    readonly weight: number;
}

export interface MethodPageDto {
    readonly coverage: Coverage;
    /** Epoch seconds of the last successful import, null before the first. */
    readonly updatedAt: number | null;
    readonly weights: readonly GradeWeightRow[];
    readonly isSampleData: boolean;
}
