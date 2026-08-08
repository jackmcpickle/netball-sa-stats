/**
 * Thin CLI entrypoint for stage 1 of the pipeline: PlayHQ -> `data/*.csv`.
 * All logic lives in `src/pipeline/fetch/run.ts` (globbed for tests under
 * `src/**`, this file is not).
 *
 * Usage:
 *   pnpm exec tsx scripts/fetch-playhq.ts [--refresh]
 */
import { runFetch } from '../src/pipeline/fetch/run.ts';

const refresh = process.argv.includes('--refresh');

const report = await runFetch({ refresh });

console.warn(
    `fetched ${report.seasons} seasons, ${report.grades} grades, ${report.teams} teams, ${report.results} results`,
);
const tooFewTeams = report.skippedGrades.filter(
    (g) => g.reason === 'too_few_teams',
);
const outOfScope = report.skippedGrades.filter(
    (g) => g.reason === 'out_of_scope',
);
if (tooFewTeams.length > 0) {
    console.warn(`skipped ${tooFewTeams.length} grade(s) with <2 teams:`);
    for (const skipped of tooFewTeams) {
        console.warn(
            `  ${skipped.seasonKey} / ${skipped.gradeName} (${skipped.teamCount} team(s))`,
        );
    }
}
if (outOfScope.length > 0) {
    console.warn(
        `skipped ${outOfScope.length} out-of-scope grade(s) (not a catalogued competition):`,
    );
    for (const skipped of outOfScope) {
        console.warn(`  ${skipped.seasonKey} / ${skipped.gradeName}`);
    }
}
