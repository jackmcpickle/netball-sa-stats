/**
 * Thin CLI entrypoint for stage 1 of the pipeline: PlayHQ -> `data/*.csv`.
 * All logic lives in `src/pipeline/fetch/run.ts` (globbed for tests under
 * `src/**`, this file is not).
 *
 * Usage:
 *   pnpm exec tsx scripts/fetch-playhq.ts [--refresh]
 *     [--games] [--year=2026 ...] [--grade=<playhq id>]
 *     [--org=<playhq org id>] [--competition=<catalogue key>]
 *
 * Default walk is AMND + Netball SA + metro associations in COLLECT_JOBS.
 * Pass `--org` or `--competition` to target one (saucna, suna, elizabeth,
 * city_night_division, sammna). New association jobs start at 2023.
 */
import { isNull, isUndefined } from 'es-toolkit';
import { runFetch } from '../src/pipeline/fetch/run.ts';
import { COMPETITION_SEEDS } from '../src/pipeline/seed/catalogue.ts';

const refresh = process.argv.includes('--refresh');
const games = process.argv.includes('--games');
const years = process.argv
    .filter((arg) => arg.startsWith('--year='))
    .map((arg) => Number(arg.slice('--year='.length)))
    .filter((year) => !Number.isNaN(year));
const gradeArg = process.argv.find((arg) => arg.startsWith('--grade='));
const gradeId = gradeArg?.slice('--grade='.length);

function flaggedValues(prefix: string): string[] {
    return process.argv
        .filter((arg) => arg.startsWith(prefix))
        .map((arg) => arg.slice(prefix.length))
        .filter((value) => value.length > 0);
}

function orgIdsFromFlags(): string[] | undefined {
    const fromOrg = flaggedValues('--org=');
    const fromCompetition = flaggedValues('--competition=').map((key) => {
        const seed = COMPETITION_SEEDS.find((entry) => entry.key === key);
        if (isUndefined(seed)) {
            throw new Error(
                `unknown competition "${key}" — not in the catalogue`,
            );
        }
        if (isNull(seed.playhqOrgId)) {
            throw new Error(`competition "${key}" has no PlayHQ org id yet`);
        }
        return seed.playhqOrgId;
    });
    const orgIds = [...new Set([...fromOrg, ...fromCompetition])];
    return orgIds.length === 0 ? undefined : orgIds;
}

const report = await runFetch({
    games,
    gradeId,
    orgIds: orgIdsFromFlags(),
    refresh,
    years,
});

console.warn(
    `fetched ${report.seasons} seasons, ${report.grades} grades, ${report.teams} teams, ${report.results} results, ${report.games} games`,
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
