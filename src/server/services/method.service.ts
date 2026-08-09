/**
 * Replaces `src/server/loaders/method.ts`.
 */
import type { Db } from '@/db';
import { fetchCoverage, IS_SAMPLE_DATA } from '@/db/queries/coverage';
import type { Repos } from '@/server/container';
import type { DomainError, Result } from '@/server/domain/result';
import { ok } from '@/server/domain/result';
import type { MethodPageDto } from '@/server/dto/method.dto';

export function createMethodService(
    repos: Repos,
    db: Db,
): {
    getPage(): Promise<Result<MethodPageDto, DomainError>>;
} {
    return {
        async getPage(): Promise<Result<MethodPageDto, DomainError>> {
            const [coverage, weights] = await Promise.all([
                fetchCoverage(db),
                repos.weights.all(),
            ]);
            return ok({ coverage, weights, isSampleData: IS_SAMPLE_DATA });
        },
    };
}
