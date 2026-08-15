/**
 * Replaces `src/server/loaders/clubs-index.ts` and
 * `src/server/loaders/club-profile.ts` — both pages are about clubs, so one
 * service serves both.
 */
import { isUndefined } from 'es-toolkit';
import { CLUB_RESULTS_TABLE_SPEC } from '@/db/queries/club-profile';
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
import type { ClubIndexPageDto, ClubIndexParams } from '@/server/dto/clubs.dto';
import type { ChampionshipSeason } from '@/server/dto/rankings.dto';

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
            const seasonCoverage = await repos.seasons.coverage();
            const latest = seasonCoverage.latestRankedYear();
            if (!latest.ok) {
                return latest;
            }
            const year = latest.value;
            const [history, clubs] = await Promise.all([
                repos.championship.history(),
                repos.clubs.all(),
            ]);
            const seasonRows =
                history.find((entry) => entry.year === year)?.rows ?? [];
            const lastRanked = lastRankedYears(history);
            const rankedKeys = new Set(seasonRows.map((row) => row.club.key));
            const { present, past } = partitionClubs(clubs, rankedKeys);
            const visible = includePast ? [...present, ...past] : present;

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
