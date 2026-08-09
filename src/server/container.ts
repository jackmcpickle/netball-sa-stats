/**
 * Composition root. The only place repos are wired together and handed to
 * services — routes call `createServices(getDb())` and never touch a repo
 * directly.
 */
import type { Db } from '@/db';
import type { DomainError } from '@/server/domain/result';
import { createChampionshipRepo } from '@/server/repos/championship.repo';
import { createClubsRepo } from '@/server/repos/clubs.repo';
import { createGradesRepo } from '@/server/repos/grades.repo';
import { createSeasonsRepo } from '@/server/repos/seasons.repo';
import { createWeightsRepo } from '@/server/repos/weights.repo';
import { createClubsService } from '@/server/services/clubs.service';
import { createLaddersService } from '@/server/services/ladders.service';
import { createMethodService } from '@/server/services/method.service';
import { createRankingsService } from '@/server/services/rankings.service';

export interface Repos {
    readonly seasons: ReturnType<typeof createSeasonsRepo>;
    readonly championship: ReturnType<typeof createChampionshipRepo>;
    readonly clubs: ReturnType<typeof createClubsRepo>;
    readonly grades: ReturnType<typeof createGradesRepo>;
    readonly weights: ReturnType<typeof createWeightsRepo>;
}

function createRepos(db: Db): Repos {
    return {
        seasons: createSeasonsRepo(db),
        championship: createChampionshipRepo(db),
        clubs: createClubsRepo(db),
        grades: createGradesRepo(db),
        weights: createWeightsRepo(db),
    };
}

export function createServices(db: Db): {
    readonly rankings: ReturnType<typeof createRankingsService>;
    readonly ladders: ReturnType<typeof createLaddersService>;
    readonly clubs: ReturnType<typeof createClubsService>;
    readonly method: ReturnType<typeof createMethodService>;
} {
    const repos = createRepos(db);
    return {
        rankings: createRankingsService(repos, db),
        ladders: createLaddersService(repos),
        clubs: createClubsService(repos, db),
        method: createMethodService(repos, db),
    };
}

/**
 * Human-readable message for a `DomainError` that is not `not-found` (routes
 * turn `not-found` into `notFound()` instead of a thrown `Error`). Rendered
 * by each route's existing `errorComponent`.
 */
export function describeDomainError(error: DomainError): string {
    switch (error.kind) {
        case 'not-found':
            return `No ${error.entity} found for "${error.key}"`;
        case 'no-ranked-seasons':
            return 'No ranked seasons are available yet.';
        case 'empty-dataset':
            return 'No data is available yet.';
        default:
            return 'Something went wrong loading this page.';
    }
}
