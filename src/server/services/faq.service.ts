import { isNull } from 'es-toolkit';
import type { Repos } from '@/server/container';
import { Championship } from '@/server/domain/championship';
import type { DomainError, Result } from '@/server/domain/result';
import { ok } from '@/server/domain/result';
import type { FaqPageDto } from '@/server/dto/faq.dto';
import type { ChampionshipLeader } from '@/server/dto/rankings.dto';

export interface FaqService {
    readonly getPage: () => Promise<Result<FaqPageDto, DomainError>>;
}

export function createFaqService(repos: Repos): FaqService {
    return {
        async getPage(): Promise<Result<FaqPageDto, DomainError>> {
            const coverage = await repos.seasons.fullCoverage();
            const latestRankedYear = coverage.rankedYears.at(-1) ?? null;
            let leader: ChampionshipLeader | null = null;
            if (!isNull(latestRankedYear)) {
                const history = await repos.championship.history();
                const championship = Championship.fromHistory(
                    history,
                    latestRankedYear,
                );
                if (championship.ok) {
                    const row = championship.value.leader();
                    leader = isNull(row)
                        ? null
                        : {
                              club: row.club,
                              points: row.points,
                              teams: row.teams,
                          };
                }
            }
            return ok({
                coverage,
                fixtureFromYear: await repos.games.earliestYear(),
                latestRankedYear,
                leader,
            });
        },
    };
}
