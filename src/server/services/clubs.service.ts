/**
 * Replaces `src/server/loaders/clubs-index.ts` and
 * `src/server/loaders/club-profile.ts` — both pages are about clubs, so one
 * service serves both.
 */
import { CLUB_RESULTS_TABLE_SPEC } from '@/db/queries/clubs';
import type { Repos } from '@/server/container';
import { partitionClubs } from '@/server/domain/club-directory';
import { sortClubResults } from '@/server/domain/club-history';
import type { DomainError, Result } from '@/server/domain/result';
import { err, ok } from '@/server/domain/result';
import { TableQuery } from '@/server/domain/table-query';
import type {
    ClubProfileParams,
    ClubProfilePageDto,
} from '@/server/dto/club-profile.dto';
import type { ClubIndexPageDto, ClubIndexParams } from '@/server/dto/clubs.dto';
import type { ChampionshipSeason } from '@/server/dto/rankings.dto';

function lastRankedYears(
    history: readonly ChampionshipSeason[],
): ReadonlyMap<string, number> {
    const latest = new Map<string, number>();
    for (const season of history) {
        for (const row of season.rows) {
            const seen = latest.get(row.club.key);
            if (seen === undefined || season.year > seen) {
                latest.set(row.club.key, season.year);
            }
        }
    }
    return latest;
}

export function createClubsService(repos: Repos): {
    getIndexPage(
        params: ClubIndexParams,
    ): Promise<Result<ClubIndexPageDto, DomainError>>;
    getProfilePage(
        params: ClubProfileParams,
    ): Promise<Result<ClubProfilePageDto, DomainError>>;
} {
    return {
        async getIndexPage(
            params: ClubIndexParams,
        ): Promise<Result<ClubIndexPageDto, DomainError>> {
            const includePast = params.includePast ?? false;
            const latest = (await repos.seasons.coverage()).latestRankedYear();
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
                year,
                includePast,
                presentCount: present.length,
                totalCount: clubs.length,
                entries: visible.map((club) => {
                    const row = seasonRows.find(
                        (entry) => entry.club.key === club.key,
                    );
                    return {
                        club,
                        rank: row?.rank ?? null,
                        points: row?.points ?? null,
                        teams: row?.teams ?? null,
                        lastRankedYear: lastRanked.get(club.key) ?? null,
                    };
                }),
            });
        },

        async getProfilePage(
            params: ClubProfileParams,
        ): Promise<Result<ClubProfilePageDto, DomainError>> {
            const profile = await repos.clubs.profile(params.clubKey);
            if (!profile) {
                return err({
                    kind: 'not-found',
                    entity: 'club',
                    key: params.clubKey,
                });
            }
            const paged = TableQuery.from(
                {
                    sort: params.sort,
                    dir: params.dir,
                    page: params.page,
                    pageSize: params.pageSize,
                },
                CLUB_RESULTS_TABLE_SPEC,
            ).apply(profile.results, sortClubResults);
            const clubs = await repos.clubs.all();

            return ok({
                profile: {
                    ...profile,
                    results: paged.rows,
                    totalRows: paged.totalRows,
                    tableState: paged.state,
                },
                clubs,
            });
        },
    };
}
