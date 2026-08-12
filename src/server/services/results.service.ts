/**
 * Serves `/results`. Season and grade resolution mirrors `ladders.service`
 * deliberately — the two pages share a mental model, and a `/ladders` URL
 * with the year and grade swapped onto `/results` should land on the same
 * competition.
 */
import type { Repos } from '@/server/container';
import {
    FIXTURES_TABLE_SPEC,
    sortFixtures,
    toResultRows,
} from '@/server/domain/fixtures';
import type { DomainError, Result } from '@/server/domain/result';
import { ok } from '@/server/domain/result';
import { TableQuery } from '@/server/domain/table-query';
import type { ResultsPageDto, ResultsParams } from '@/server/dto/results.dto';

export function createResultsService(repos: Repos): {
    getPage(
        params: ResultsParams,
    ): Promise<Result<ResultsPageDto, DomainError>>;
} {
    return {
        async getPage(
            params: ResultsParams,
        ): Promise<Result<ResultsPageDto, DomainError>> {
            const coverage = await repos.seasons.coverage();
            const year = coverage.resolveYear(params.year);
            if (year === undefined) {
                return ok({
                    years: coverage.years(),
                    year: null,
                    grades: [],
                    fixtures: null,
                });
            }

            const grades = await repos.grades.forYear(year);
            const grade =
                grades.find((entry) => entry.key === params.grade) ?? grades[0];
            if (grade === undefined) {
                return ok({
                    years: coverage.years(),
                    year,
                    grades,
                    fixtures: null,
                });
            }

            const rows = toResultRows(
                await repos.games.factsForGrade(grade.key),
            );
            if (rows.length === 0) {
                // A grade with no fixtures is a real state: ladders go back to
                // the archive, but fixtures only exist from 2025.
                return ok({
                    years: coverage.years(),
                    year,
                    grades,
                    fixtures: null,
                });
            }

            const paged = TableQuery.from(
                {
                    sort: params.sort,
                    dir: params.dir,
                    page: params.page,
                    pageSize: params.pageSize,
                },
                FIXTURES_TABLE_SPEC,
            ).apply(rows, sortFixtures);

            return ok({
                years: coverage.years(),
                year,
                grades,
                fixtures: {
                    grade,
                    rows: paged.rows,
                    totalRows: paged.totalRows,
                    tableState: paged.state,
                },
            });
        },
    };
}
