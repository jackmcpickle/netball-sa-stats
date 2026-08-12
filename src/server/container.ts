/**
 * Composition root. The only place repos are wired together and handed to
 * services — routes call `createServices(getDb())` and never touch a repo
 * directly.
 */
import { notFound } from '@tanstack/react-router';
import type { Db } from '@/db';
import type { DomainError, Result } from '@/server/domain/result';
import { createChampionshipRepo } from '@/server/repos/championship.repo';
import { createClubsRepo } from '@/server/repos/clubs.repo';
import { createGamesRepo } from '@/server/repos/games.repo';
import { createGradesRepo } from '@/server/repos/grades.repo';
import { createSeasonsRepo } from '@/server/repos/seasons.repo';
import { createWeightsRepo } from '@/server/repos/weights.repo';
import { createClubsService } from '@/server/services/clubs.service';
import { createHeadToHeadService } from '@/server/services/head-to-head.service';
import { createLaddersService } from '@/server/services/ladders.service';
import { createMethodService } from '@/server/services/method.service';
import { createRankingsService } from '@/server/services/rankings.service';
import { createResultsService } from '@/server/services/results.service';

export interface Repos {
    readonly seasons: ReturnType<typeof createSeasonsRepo>;
    readonly championship: ReturnType<typeof createChampionshipRepo>;
    readonly clubs: ReturnType<typeof createClubsRepo>;
    readonly grades: ReturnType<typeof createGradesRepo>;
    readonly weights: ReturnType<typeof createWeightsRepo>;
    readonly games: ReturnType<typeof createGamesRepo>;
}

function createRepos(db: Db): Repos {
    return {
        seasons: createSeasonsRepo(db),
        championship: createChampionshipRepo(db),
        clubs: createClubsRepo(db),
        grades: createGradesRepo(db),
        weights: createWeightsRepo(db),
        games: createGamesRepo(db),
    };
}

export function createServices(db: Db): {
    readonly rankings: ReturnType<typeof createRankingsService>;
    readonly ladders: ReturnType<typeof createLaddersService>;
    readonly clubs: ReturnType<typeof createClubsService>;
    readonly method: ReturnType<typeof createMethodService>;
    readonly headToHead: ReturnType<typeof createHeadToHeadService>;
    readonly results: ReturnType<typeof createResultsService>;
} {
    const repos = createRepos(db);
    return {
        rankings: createRankingsService(repos),
        ladders: createLaddersService(repos),
        clubs: createClubsService(repos),
        method: createMethodService(repos),
        headToHead: createHeadToHeadService(repos),
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
        case 'not-found':
            return `No ${error.entity} found for "${error.key}"`;
        case 'no-ranked-seasons':
            return 'No ranked seasons are available yet.';
        default:
            // Exhaustive without this arm; kept only because the lint
            // config's `default-case` rule requires one on every switch.
            return 'Something went wrong loading this page.';
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
