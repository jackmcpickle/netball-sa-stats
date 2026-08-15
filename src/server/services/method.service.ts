/**
 * Replaces `src/server/loaders/method.ts`.
 */
import { IS_SAMPLE_DATA } from '@/db/queries/coverage';
import type { Repos } from '@/server/container';
import type { DomainError, Result } from '@/server/domain/result';
import { ok } from '@/server/domain/result';
import type { MethodPageDto } from '@/server/dto/method.dto';

export function createMethodService(repos: Repos): {
    getPage(): Promise<Result<MethodPageDto, DomainError>>;
} {
    return {
        async getPage(): Promise<Result<MethodPageDto, DomainError>> {
            const [coverage, weights, updatedAt] = await Promise.all([
                repos.seasons.fullCoverage(),
                repos.weights.all(),
                repos.importRuns.lastSuccessAt(),
            ]);
            return ok({
                coverage,
                weights,
                updatedAt,
                isSampleData: IS_SAMPLE_DATA,
            });
        },
    };
}
