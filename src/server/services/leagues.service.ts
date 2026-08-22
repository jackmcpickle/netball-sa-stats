import { isUndefined } from 'es-toolkit';
import { CHAMPIONSHIP_TABLE_SPEC } from '@/db/queries/championship';
import { toCompetition } from '@/db/queries/coverage';
import {
    COMPETITION_SEEDS,
    catalogueByKey,
    championshipCompetitionKeys,
} from '@/pipeline/seed/catalogue';
import type { Repos } from '@/server/container';
import { Championship } from '@/server/domain/championship';
import type { DomainError, Result } from '@/server/domain/result';
import { err, ok } from '@/server/domain/result';
import { TableQuery } from '@/server/domain/table-query';
import type { ClubIndexEntry } from '@/server/dto/clubs.dto';
import type {
    LeagueIndexEntry,
    LeagueIndexPageDto,
    LeaguePageDto,
    LeaguePageParams,
} from '@/server/dto/leagues.dto';
import type { ChampionshipSeason } from '@/server/dto/rankings.dto';

function lastRankedYears(
    history: readonly ChampionshipSeason[],
): ReadonlyMap<string, number> {
    const latest = new Map<string, number>();
    for (const season of history) {
        for (const row of season.rows) {
            const seen = latest.get(row.club.key);
            if (isUndefined(seen) || season.year > seen) {
                latest.set(row.club.key, season.year);
            }
        }
    }
    return latest;
}

export interface LeaguesService {
    readonly getIndexPage: () => Promise<Result<LeagueIndexPageDto, DomainError>>;
    readonly getPage: (
        params: LeaguePageParams,
    ) => Promise<Result<LeaguePageDto, DomainError>>;
}

export function createLeaguesService(repos: Repos): LeaguesService {
    return {
        async getIndexPage(): Promise<Result<LeagueIndexPageDto, DomainError>> {
            const coverage = await repos.seasons.fullCoverage();
            const championshipKeys = championshipCompetitionKeys();
            const leagues: LeagueIndexEntry[] = COMPETITION_SEEDS.map(
                (seed) => {
                    const seasons = coverage.competitions.find(
                        (entry) => entry.competition.key === seed.key,
                    );
                    const years = seasons?.seasons
                        .filter((season) => season.status !== 'absent')
                        .map((season) => season.year);
                    return {
                        competition: toCompetition(seed.key, seed.name),
                        hasChampionship: championshipKeys.has(seed.key),
                        hasPlayHqOrg: seed.playhqOrgId !== null,
                        latestYear:
                            isUndefined(years) || years.length === 0
                                ? null
                                : Math.max(...years),
                        seasonCount: years?.length ?? 0,
                    };
                },
            );
            return ok({ leagues });
        },

        async getPage(
            params: LeaguePageParams,
        ): Promise<Result<LeaguePageDto, DomainError>> {
            const seed = catalogueByKey(params.competitionKey);
            if (isUndefined(seed)) {
                return err({
                    entity: 'competition',
                    key: params.competitionKey,
                    kind: 'not-found',
                });
            }
            const competition = toCompetition(seed.key, seed.name);
            const hasChampionship = championshipCompetitionKeys().has(seed.key);
            const coverage = await repos.seasons.fullCoverage({
                competitionKey: seed.key,
            });
            const appearances = await repos.clubs.inCompetition(seed.key);
            const latestYear = coverage.years.at(-1) ?? null;
            const grades =
                latestYear === null
                    ? []
                    : await repos.grades.forYear(latestYear, seed.key);

            if (!hasChampionship) {
                const clubs: ClubIndexEntry[] = appearances.map((row) => ({
                    club: row.club,
                    lastRankedYear: row.years.at(-1) ?? null,
                    points: null,
                    rank: null,
                    teams: null,
                }));
                return ok({
                    clubs,
                    competition,
                    coverage,
                    grades,
                    hasChampionship: false,
                    hasPlayHqOrg: seed.playhqOrgId !== null,
                    previousYear: null,
                    season: null,
                    tableState: null,
                    totalRows: 0,
                });
            }

            const history = await repos.championship.history(seed.key);
            const rankedYears = coverage.rankedYears;
            let resolvedYear: number | null = null;
            if (
                !isUndefined(params.season) &&
                rankedYears.includes(params.season)
            ) {
                resolvedYear = params.season;
            } else {
                resolvedYear = rankedYears.at(-1) ?? null;
            }

            if (resolvedYear === null) {
                return ok({
                    clubs: appearances.map((row) => ({
                        club: row.club,
                        lastRankedYear: row.years.at(-1) ?? null,
                        points: null,
                        rank: null,
                        teams: null,
                    })),
                    competition,
                    coverage,
                    grades,
                    hasChampionship: true,
                    hasPlayHqOrg: seed.playhqOrgId !== null,
                    previousYear: null,
                    season: null,
                    tableState: null,
                    totalRows: 0,
                });
            }

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
                        dir: params.dir,
                        page: params.page,
                        pageSize: params.pageSize,
                        sort: params.sort,
                    },
                    CHAMPIONSHIP_TABLE_SPEC,
                ),
            );
            const lastRanked = lastRankedYears(history);
            const seasonRows = paged.rows;
            const rankedKeys = new Set(
                seasonRows.map((row) => row.club.key),
            );
            const clubs: ClubIndexEntry[] = appearances.map((row) => {
                const seasonRow = seasonRows.find(
                    (entry) => entry.club.key === row.club.key,
                );
                return {
                    club: row.club,
                    lastRankedYear: lastRanked.get(row.club.key) ?? null,
                    points: seasonRow?.points ?? null,
                    rank: rankedKeys.has(row.club.key)
                        ? (seasonRow?.rank ?? null)
                        : null,
                    teams: seasonRow?.teams ?? null,
                };
            });

            return ok({
                clubs,
                competition,
                coverage,
                grades,
                hasChampionship: true,
                hasPlayHqOrg: seed.playhqOrgId !== null,
                previousYear: championship.value.previousYear(rankedYears),
                season: {
                    coverageChanged:
                        history.find((entry) => entry.year === resolvedYear)
                            ?.coverageChanged ?? false,
                    rows: paged.rows,
                    year: resolvedYear,
                },
                tableState: paged.state,
                totalRows: paged.totalRows,
            });
        },
    };
}
