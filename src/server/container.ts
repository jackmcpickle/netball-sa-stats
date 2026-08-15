/**
 * Composition root. The only place repos are wired together and handed to
 * services — routes call `createServices(getDb())` and never touch a repo
 * directly.
 */
import { notFound } from '@tanstack/react-router';
import type { Db } from '@/db';
import type { DomainError, Result } from '@/server/domain/result';
import { createChampionshipRepo } from '@/server/repos/championship.repo';
import type { ChampionshipRepo } from '@/server/repos/championship.repo';
import { createClubsRepo } from '@/server/repos/clubs.repo';
import type { ClubsRepo } from '@/server/repos/clubs.repo';
import { createGamesRepo } from '@/server/repos/games.repo';
import type { GamesRepo } from '@/server/repos/games.repo';
import { createGradesRepo } from '@/server/repos/grades.repo';
import type { GradesRepo } from '@/server/repos/grades.repo';
import { createImportRunsRepo } from '@/server/repos/import-runs.repo';
import type { ImportRunsRepo } from '@/server/repos/import-runs.repo';
import { createSeasonsRepo } from '@/server/repos/seasons.repo';
import type { SeasonsRepo } from '@/server/repos/seasons.repo';
import { createWeightsRepo } from '@/server/repos/weights.repo';
import type { WeightsRepo } from '@/server/repos/weights.repo';
import { createAdminService } from '@/server/services/admin.service';
import type {
    AdminService,
    StartImport,
} from '@/server/services/admin.service';
import { createClubsService } from '@/server/services/clubs.service';
import type { ClubsService } from '@/server/services/clubs.service';
import { createHeadToHeadService } from '@/server/services/head-to-head.service';
import type { HeadToHeadService } from '@/server/services/head-to-head.service';
import { createLaddersService } from '@/server/services/ladders.service';
import type { LaddersService } from '@/server/services/ladders.service';
import { createMethodService } from '@/server/services/method.service';
import type { MethodService } from '@/server/services/method.service';
import { createRankingsService } from '@/server/services/rankings.service';
import type { RankingsService } from '@/server/services/rankings.service';
import { createResultsService } from '@/server/services/results.service';
import type { ResultsService } from '@/server/services/results.service';

export interface Repos {
    readonly seasons: SeasonsRepo;
    readonly championship: ChampionshipRepo;
    readonly clubs: ClubsRepo;
    readonly grades: GradesRepo;
    readonly weights: WeightsRepo;
    readonly games: GamesRepo;
    readonly importRuns: ImportRunsRepo;
}

export interface Services {
    readonly rankings: RankingsService;
    readonly ladders: LaddersService;
    readonly clubs: ClubsService;
    readonly method: MethodService;
    readonly headToHead: HeadToHeadService;
    readonly results: ResultsService;
    readonly admin: AdminService;
}

function createRepos(db: Db): Repos {
    return {
        championship: createChampionshipRepo(db),
        clubs: createClubsRepo(db),
        games: createGamesRepo(db),
        grades: createGradesRepo(db),
        importRuns: createImportRunsRepo(db),
        seasons: createSeasonsRepo(db),
        weights: createWeightsRepo(db),
    };
}

async function defaultStartImport(): Promise<void> {
    throw new Error('PLAYHQ_IMPORT is not bound');
}

export function createServices(
    db: Db,
    extras?: { startImport?: StartImport },
): Services {
    const repos = createRepos(db);
    return {
        admin: createAdminService(createImportRunsRepo(db), {
            startImport: extras?.startImport ?? defaultStartImport,
        }),
        clubs: createClubsService(repos),
        headToHead: createHeadToHeadService(repos),
        ladders: createLaddersService(repos),
        method: createMethodService(repos),
        rankings: createRankingsService(repos),
        results: createResultsService(repos),
    };
}

/**
 * Human-readable message for a `DomainError` that is not `not-found` (routes
 * turn `not-found` into `notFound()` instead of a thrown `Error`). Rendered
 * by each route's existing `errorComponent`.
 */
export function describeDomainError(error: DomainError): string {
    switch (error.kind) {
        case 'not-found': {
            return `No ${error.entity} found for "${error.key}"`;
        }
        case 'no-ranked-seasons': {
            return 'No ranked seasons are available yet.';
        }
        default: {
            // Exhaustive without this arm; kept only because the lint
            // config's `default-case` rule requires one on every switch.
            return 'Something went wrong loading this page.';
        }
    }
}

/**
 * Shared route-handler tail: every `createServerFn` handler awaits a
 * service call and immediately does this same translation, so it is
 * extracted here once and unit-tested directly rather than only through
 * five near-identical, hard-to-invoke `createServerFn` handlers.
 */
export function resolvePageResult<T>(result: Result<T, DomainError>): T {
    if (!result.ok) {
        if (result.error.kind === 'not-found') {
            throw notFound();
        }
        throw new Error(describeDomainError(result.error));
    }
    return result.value;
}
