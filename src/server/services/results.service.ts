/**
 * Serves `/results`. Season and grade resolution mirrors `ladders.service`
 * deliberately — the two pages share a mental model, and a `/ladders` URL
 * with the year and grade swapped onto `/results` should land on the same
 * competition.
 */
import { isUndefined } from 'es-toolkit';
import type { Repos } from '@/server/container';
import { FIXTURES_TABLE_SPEC, toResultRows } from '@/server/domain/fixtures';
import type { DomainError, Result } from '@/server/domain/result';
import { ok } from '@/server/domain/result';
import { TableQuery } from '@/server/domain/table-query';
import type { ResultsPageDto, ResultsParams } from '@/server/dto/results.dto';

export interface ResultsService {
    readonly getPage: (
        params: ResultsParams,
    ) => Promise<Result<ResultsPageDto, DomainError>>;
}

export function createResultsService(repos: Repos): ResultsService {
    return {
        async getPage(
            params: ResultsParams,
        ): Promise<Result<ResultsPageDto, DomainError>> {
            const coverage = await repos.seasons.coverage();
            const year = coverage.resolveYear(params.year);
            if (isUndefined(year)) {
                return ok({
                    fixtures: null,
                    grades: [],
                    year: null,
                    years: coverage.years(),
                });
            }

            const grades = await repos.grades.forYear(year);
            const grade =
                grades.find((entry) => entry.key === params.grade) ?? grades[0];
            if (isUndefined(grade)) {
                return ok({
                    fixtures: null,
                    grades,
                    year,
                    years: coverage.years(),
                });
            }

            // Counted first so the page can be clamped, then one page is
            // fetched — the grade's other 250 fixtures never leave SQLite.
            const paged = await TableQuery.from(
                {
                    dir: params.dir,
                    page: params.page,
                    pageSize: params.pageSize,
                    sort: params.sort,
                },
                FIXTURES_TABLE_SPEC,
            ).page(
                async () => await repos.games.countForGrade(grade.key),
                async (request) =>
                    toResultRows(
                        await repos.games.pageForGrade(grade.key, request),
                    ),
            );

            if (paged.totalRows === 0) {
                // A grade with no fixtures is a real state: ladders go back to
                // the archive, but fixtures only exist from 2025.
                return ok({
                    fixtures: null,
                    grades,
                    year,
                    years: coverage.years(),
                });
            }

            return ok({
                fixtures: {
                    grade,
                    rows: paged.rows,
                    tableState: paged.state,
                    totalRows: paged.totalRows,
                },
                grades,
                year,
                years: coverage.years(),
            });
        },
    };
}
