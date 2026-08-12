/**
 * Replaces `src/server/loaders/ladders.ts`.
 */
import { LADDER_TABLE_SPEC } from '@/db/queries/grades';
import type { Repos } from '@/server/container';
import type { DomainError, Result } from '@/server/domain/result';
import { ok } from '@/server/domain/result';
import { TableQuery } from '@/server/domain/table-query';
import type { LaddersPageDto, LaddersParams } from '@/server/dto/ladders.dto';

export function createLaddersService(repos: Repos): {
    getPage(
        params: LaddersParams,
    ): Promise<Result<LaddersPageDto, DomainError>>;
} {
    return {
        async getPage(
            params: LaddersParams,
        ): Promise<Result<LaddersPageDto, DomainError>> {
            const coverage = await repos.seasons.coverage();
            const year = coverage.resolveYear(params.year);
            if (year === undefined) {
                return ok({
                    years: coverage.years(),
                    year: null,
                    grades: [],
                    ladder: null,
                });
            }
            const grades = await repos.grades.forYear(year);
            const gradeKey =
                params.grade !== undefined &&
                grades.some((grade) => grade.key === params.grade)
                    ? params.grade
                    : grades[0]?.key;

            if (gradeKey === undefined) {
                return ok({
                    years: coverage.years(),
                    year,
                    grades,
                    ladder: null,
                });
            }

            const ladderResult = await repos.grades.ladder(gradeKey);
            if (!ladderResult.ok) {
                return ok({
                    years: coverage.years(),
                    year,
                    grades,
                    ladder: null,
                });
            }
            const paged = ladderResult.value.sorted(
                TableQuery.from(
                    {
                        sort: params.sort,
                        dir: params.dir,
                        page: params.page,
                        pageSize: params.pageSize,
                    },
                    LADDER_TABLE_SPEC,
                ),
            );

            return ok({
                years: coverage.years(),
                year,
                grades,
                ladder: {
                    grade: ladderResult.value.grade(),
                    rows: paged.rows,
                    totalRows: paged.totalRows,
                    tableState: paged.state,
                },
            });
        },
    };
}
