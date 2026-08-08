import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { MethodPage } from '@/components/method/method-page';
import { getCoverage, IS_SAMPLE_DATA, listGradeWeights } from '@/data';
import type { Coverage, GradeWeightRow } from '@/data/types';

export interface MethodData {
    readonly coverage: Coverage;
    readonly weights: readonly GradeWeightRow[];
    readonly isSampleData: boolean;
}

const loadMethod = createServerFn({ method: 'GET' }).handler(
    async (): Promise<MethodData> => {
        const [coverage, weights] = await Promise.all([
            getCoverage(),
            listGradeWeights(),
        ]);
        return { coverage, weights, isSampleData: IS_SAMPLE_DATA };
    },
);

export const Route = createFileRoute('/method')({
    loader: async () => loadMethod(),
    component: MethodPage,
});
