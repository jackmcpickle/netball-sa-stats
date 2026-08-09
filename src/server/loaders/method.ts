import { getCoverage, IS_SAMPLE_DATA, listGradeWeights } from '@/data';
import type { Coverage, GradeWeightRow } from '@/data/types';
import type { Db } from '@/db';

export interface MethodData {
    readonly coverage: Coverage;
    readonly weights: readonly GradeWeightRow[];
    readonly isSampleData: boolean;
}

export async function loadMethodData(db: Db): Promise<MethodData> {
    const [coverage, weights] = await Promise.all([
        getCoverage(db),
        listGradeWeights(db),
    ]);
    return { coverage, weights, isSampleData: IS_SAMPLE_DATA };
}
