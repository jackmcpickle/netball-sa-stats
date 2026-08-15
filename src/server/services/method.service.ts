/**
 * Replaces `src/server/loaders/method.ts`.
 */
import { IS_SAMPLE_DATA } from '@/db/queries/coverage';
import type { Repos } from '@/server/container';
import type { DomainError, Result } from '@/server/domain/result';
import { ok } from '@/server/domain/result';
import type { MethodPageDto } from '@/server/dto/method.dto';

export interface MethodService {
    readonly getPage: () => Promise<Result<MethodPageDto, DomainError>>;
}

export function createMethodService(repos: Repos): MethodService {
    return {
        async getPage(): Promise<Result<MethodPageDto, DomainError>> {
            const [coverage, weights, updatedAt] = await Promise.all([
                repos.seasons.fullCoverage(),
                repos.weights.all(),
                repos.importRuns.lastSuccessAt(),
            ]);
            return ok({
                coverage,
                isSampleData: IS_SAMPLE_DATA,
                updatedAt,
                weights,
            });
        },
    };
}
