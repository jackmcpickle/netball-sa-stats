/**
 * Replaces `src/server/loaders/rankings.ts`. Assembles the rankings page DTO
 * from repos + the `Championship` domain object, returning a `Result` instead
 * of throwing.
 */
import type { Db } from '@/db';
import { CHAMPIONSHIP_TABLE_SPEC } from '@/db/queries/championship';
import { fetchCoverage } from '@/db/queries/coverage';
import type { Repos } from '@/server/container';
import { Championship } from '@/server/domain/championship';
import type { DomainError, Result } from '@/server/domain/result';
import { ok } from '@/server/domain/result';
import { TableQuery } from '@/server/domain/table-query';
import type {
    ChampionshipSeason,
    ClubRankSeries,
    RankingsPageDto,
    RankingsParams,
    RankPoint,
} from '@/server/dto/rankings.dto';
import type { Club } from '@/server/dto/shared.dto';

function seriesPoints(
    history: readonly ChampionshipSeason[],
    key: string,
): readonly RankPoint[] {
    return history.flatMap((season) => {
        const row = season.rows.find((entry) => entry.club.key === key);
        return row
            ? [{ year: season.year, rank: row.rank, points: row.points }]
            : [];
    });
}

/**
 * Rank history for the movement chart, limited to the `limit` clubs with the
 * most career points plus any club the caller wants to keep visible.
 */
function rankSeries(
    history: readonly ChampionshipSeason[],
    limit: number,
    focusKey?: string,
): readonly ClubRankSeries[] {
    const careerPoints = new Map<string, number>();
    const clubs = new Map<string, Club>();
    for (const season of history) {
        for (const row of season.rows) {
            careerPoints.set(
                row.club.key,
                (careerPoints.get(row.club.key) ?? 0) + row.points,
            );
            clubs.set(row.club.key, row.club);
        }
    }
    const ordered = [...careerPoints.entries()].sort((a, b) => b[1] - a[1]);
    const keys = ordered.slice(0, limit).map(([key]) => key);
    if (focusKey && !keys.includes(focusKey) && careerPoints.has(focusKey)) {
        keys.push(focusKey);
    }
    return keys.flatMap((key) => {
        const club = clubs.get(key);
        return club ? [{ club, points: seriesPoints(history, key) }] : [];
    });
}

export function createRankingsService(
    repos: Repos,
    db: Db,
): {
    getPage(
        params: RankingsParams,
    ): Promise<Result<RankingsPageDto, DomainError>>;
} {
    return {
        async getPage(
            params: RankingsParams,
        ): Promise<Result<RankingsPageDto, DomainError>> {
            const coverage = await fetchCoverage(db);
            const rankedYears = coverage.rankedYears;
            let resolvedYear: number;
            if (
                params.season !== undefined &&
                rankedYears.includes(params.season)
            ) {
                resolvedYear = params.season;
            } else {
                const latest = (
                    await repos.seasons.coverage()
                ).latestRankedYear();
                if (!latest.ok) {
                    return latest;
                }
                resolvedYear = latest.value;
            }

            const history = await repos.championship.history();
            const championship = Championship.fromHistory(
                history,
                resolvedYear,
            );
            if (!championship.ok) {
                return championship;
            }
            const paged = championship.value.sorted(
                TableQuery.from(
                    {
                        sort: params.sort,
                        dir: params.dir,
                        page: params.page,
                        pageSize: params.pageSize,
                    },
                    CHAMPIONSHIP_TABLE_SPEC,
                ),
            );
            const previousYear = championship.value.previousYear(rankedYears);
            const clubs = await repos.clubs.all();
            const gradesByYear = await Promise.all(
                coverage.years.map(async (gradeYear) =>
                    repos.grades.forYear(gradeYear),
                ),
            );
            const worstRank = Math.max(
                1,
                ...history.map((season) => season.rows.length),
            );

            return ok({
                coverage,
                season: {
                    year: resolvedYear,
                    rows: paged.rows,
                    coverageChanged:
                        history.find((entry) => entry.year === resolvedYear)
                            ?.coverageChanged ?? false,
                },
                totalRows: paged.totalRows,
                tableState: paged.state,
                previousYear,
                series: rankSeries(history, 7),
                worstRank,
                clubCount: clubs.length,
                gradeCount: gradesByYear.reduce(
                    (total, grades) => total + grades.length,
                    0,
                ),
            });
        },
    };
}
