/**
 * Replaces `src/server/loaders/clubs-index.ts` and
 * `src/server/loaders/club-profile.ts` — both pages are about clubs, so one
 * service serves both.
 */
import { isUndefined } from 'es-toolkit';
import { CLUB_RESULTS_TABLE_SPEC } from '@/db/queries/club-profile';
import { toCompetition } from '@/db/queries/coverage';
import {
    COMPETITION_SEEDS,
    championshipCompetitionKeys,
} from '@/pipeline/seed/catalogue';
import type { Repos } from '@/server/container';
import { partitionClubs } from '@/server/domain/club-directory';
import { topOpponents } from '@/server/domain/head-to-head';
import type { DomainError, Result } from '@/server/domain/result';
import { err, ok } from '@/server/domain/result';
import { TableQuery } from '@/server/domain/table-query';
import type {
    ClubProfileParams,
    ClubProfilePageDto,
} from '@/server/dto/club-profile.dto';
import type {
    ClubIndexEntry,
    ClubIndexGroup,
    ClubIndexPageDto,
    ClubIndexParams,
} from '@/server/dto/clubs.dto';
import type { ChampionshipSeason } from '@/server/dto/rankings.dto';
import type { Club } from '@/server/dto/shared.dto';

/** Five is the design's figure: enough to be a shortlist, not a directory. */
const TOP_OPPONENT_LIMIT = 5;

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

function entriesFor(
    clubs: readonly Club[],
    seasonRows: ChampionshipSeason['rows'],
    lastRanked: ReadonlyMap<string, number>,
    includePast: boolean,
): { entries: ClubIndexEntry[]; presentCount: number } {
    const rankedKeys = new Set(seasonRows.map((row) => row.club.key));
    const { present, past } = partitionClubs(clubs, rankedKeys);
    const visible = includePast ? [...present, ...past] : present;
    return {
        entries: visible.map((club) => {
            const row = seasonRows.find((entry) => entry.club.key === club.key);
            return {
                club,
                lastRankedYear: lastRanked.get(club.key) ?? null,
                points: row?.points ?? null,
                rank: row?.rank ?? null,
                teams: row?.teams ?? null,
            };
        }),
        presentCount: present.length,
    };
}

export interface ClubsService {
    readonly getIndexPage: (
        params: ClubIndexParams,
    ) => Promise<Result<ClubIndexPageDto, DomainError>>;
    readonly getProfilePage: (
        params: ClubProfileParams,
    ) => Promise<Result<ClubProfilePageDto, DomainError>>;
}

export function createClubsService(repos: Repos): ClubsService {
    return {
        async getIndexPage(
            params: ClubIndexParams,
        ): Promise<Result<ClubIndexPageDto, DomainError>> {
            const includePast = params.includePast ?? false;
            const seasonCoverage = await repos.seasons.coverage({
                championshipOnly: true,
            });
            const latest = seasonCoverage.latestRankedYear();
            if (!latest.ok) {
                return latest;
            }
            const year = latest.value;
            const [history, clubs, coverage] = await Promise.all([
                repos.championship.history(),
                repos.clubs.all(),
                repos.seasons.fullCoverage(),
            ]);
            const seasonRows =
                history.find((entry) => entry.year === year)?.rows ?? [];
            const lastRanked = lastRankedYears(history);
            const rankedKeys = new Set(seasonRows.map((row) => row.club.key));
            const { present, past } = partitionClubs(clubs, rankedKeys);
            const visible = includePast ? [...present, ...past] : present;
            const championshipKeys = championshipCompetitionKeys();
            const groupKeys = COMPETITION_SEEDS.map(
                (seed) => seed.key,
            ).filter((key) =>
                coverage.competitions.some(
                    (entry) => entry.competition.key === key,
                ),
            );

            const groups: ClubIndexGroup[] = (
                await Promise.all(
                    groupKeys.map(async (key) => {
                        const seed = COMPETITION_SEEDS.find(
                            (competition) => competition.key === key,
                        );
                        if (isUndefined(seed)) {
                            return null;
                        }
                        const competition = toCompetition(key, seed.name);
                        const appearances =
                            await repos.clubs.inCompetition(key);
                        if (championshipKeys.has(key)) {
                            const [leagueHistory, leagueCoverage] =
                                await Promise.all([
                                    repos.championship.history(key),
                                    repos.seasons.coverage({
                                        competitionKey: key,
                                    }),
                                ]);
                            const leagueYear =
                                leagueCoverage.latestRankedYear();
                            const leagueClubs = appearances.map(
                                (row) => row.club,
                            );
                            const resolvedYear = leagueYear.ok
                                ? leagueYear.value
                                : null;
                            const leagueRows = isUndefined(resolvedYear)
                                ? []
                                : (leagueHistory.find(
                                      (entry) => entry.year === resolvedYear,
                                  )?.rows ?? []);
                            const built = entriesFor(
                                leagueClubs,
                                leagueRows,
                                lastRankedYears(leagueHistory),
                                includePast,
                            );
                            return {
                                competition,
                                entries: built.entries,
                                presentCount: built.presentCount,
                                year: resolvedYear,
                            };
                        }
                        if (appearances.length === 0) {
                            return null;
                        }
                        const latestYear = Math.max(
                            ...appearances.flatMap((row) => row.years),
                        );
                        const presentClubs = appearances.filter((row) =>
                            row.years.includes(latestYear),
                        );
                        const shown = includePast
                            ? appearances
                            : presentClubs;
                        return {
                            competition,
                            entries: shown.map((row) => ({
                                club: row.club,
                                lastRankedYear: row.years.at(-1) ?? null,
                                points: null,
                                rank: null,
                                teams: null,
                            })),
                            presentCount: presentClubs.length,
                            year: latestYear,
                        };
                    }),
                )
            ).filter((group) => group !== null);

            return ok({
                entries: visible.map((club) => {
                    const row = seasonRows.find(
                        (entry) => entry.club.key === club.key,
                    );
                    return {
                        club,
                        lastRankedYear: lastRanked.get(club.key) ?? null,
                        points: row?.points ?? null,
                        rank: row?.rank ?? null,
                        teams: row?.teams ?? null,
                    };
                }),
                groups,
                includePast,
                presentCount: present.length,
                totalCount: clubs.length,
                year,
            });
        },

        async getProfilePage(
            params: ClubProfileParams,
        ): Promise<Result<ClubProfilePageDto, DomainError>> {
            const profile = await repos.clubs.profile(params.clubKey);
            if (!profile) {
                return err({
                    entity: 'club',
                    key: params.clubKey,
                    kind: 'not-found',
                });
            }
            // The aggregates above span the club's whole history; the table
            // below is one page, counted and sliced in SQL like every other
            // table on the site.
            const [paged, clubs, counts] = await Promise.all([
                TableQuery.from(
                    {
                        dir: params.dir,
                        page: params.page,
                        pageSize: params.pageSize,
                        sort: params.sort,
                    },
                    CLUB_RESULTS_TABLE_SPEC,
                ).page(
                    async () => await repos.clubs.countResults(params.clubKey),
                    async (request) =>
                        await repos.clubs.resultsPage(params.clubKey, request),
                ),
                repos.clubs.all(),
                repos.games.opponentCounts(params.clubKey),
            ]);
            const byKey = new Map(clubs.map((club) => [club.key, club]));

            return ok({
                clubs,
                profile: {
                    ...profile,
                    results: paged.rows,
                    tableState: paged.state,
                    totalRows: paged.totalRows,
                },
                topOpponents: topOpponents(counts)
                    .slice(0, TOP_OPPONENT_LIMIT)
                    .flatMap((count) => {
                        const club = byKey.get(count.clubKey);
                        // A counted opponent with no club row would be a
                        // broken link, so it is dropped rather than faked.
                        return isUndefined(club)
                            ? []
                            : [{ club, played: count.played }];
                    }),
            });
        },
    };
}
