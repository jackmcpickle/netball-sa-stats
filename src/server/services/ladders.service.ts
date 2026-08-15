import { isNull, isUndefined } from 'es-toolkit';
/**
 * Replaces `src/server/loaders/ladders.ts`.
 */
import { LADDER_TABLE_SPEC } from '@/db/queries/grades';
import type { Repos } from '@/server/container';
import type { DomainError, Result } from '@/server/domain/result';
import { ok } from '@/server/domain/result';
import { TableQuery } from '@/server/domain/table-query';
import type {
    LadderDto,
    LaddersPageDto,
    LaddersParams,
} from '@/server/dto/ladders.dto';

export interface LaddersService {
    readonly getPage: (
        params: LaddersParams,
    ) => Promise<Result<LaddersPageDto, DomainError>>;
}

export function createLaddersService(repos: Repos): LaddersService {
    return {
        async getPage(
            params: LaddersParams,
        ): Promise<Result<LaddersPageDto, DomainError>> {
            const coverage = await repos.seasons.coverage();
            const year = coverage.resolveYear(params.year);
            if (isUndefined(year)) {
                return ok({
                    years: coverage.years(),
                    year: null,
                    grades: [],
                    ladder: null,
                });
            }
            const grades = await repos.grades.forYear(year);
            const gradeKey =
                !isUndefined(params.grade) &&
                grades.some((grade) => grade.key === params.grade)
                    ? params.grade
                    : grades[0]?.key;

            if (isUndefined(gradeKey)) {
                return ok({
                    years: coverage.years(),
                    year,
                    grades,
                    ladder: null,
                });
            }

            // Counted first so the page can be clamped, then one page is
            // fetched. A ladder is only ever 6-12 teams, so this is for
            // consistency with the other tables rather than for speed —
            // every table now sorts and slices in the same place.
            let grade: LadderDto['grade'] | null = null;
            const paged = await TableQuery.from(
                {
                    sort: params.sort,
                    dir: params.dir,
                    page: params.page,
                    pageSize: params.pageSize,
                },
                LADDER_TABLE_SPEC,
            ).page(
                async () => await repos.grades.countLadder(gradeKey),
                async (request) => {
                    const result = await repos.grades.ladderPage(
                        gradeKey,
                        request,
                    );
                    if (!result.ok) {
                        return [];
                    }
                    const { grade: ladderGrade, rows } = result.value;
                    grade = ladderGrade;
                    return rows;
                },
            );

            if (isNull(grade)) {
                return ok({
                    years: coverage.years(),
                    year,
                    grades,
                    ladder: null,
                });
            }

            return ok({
                years: coverage.years(),
                year,
                grades,
                ladder: {
                    grade,
                    rows: paged.rows,
                    totalRows: paged.totalRows,
                    tableState: paged.state,
                },
            });
        },
    };
}
