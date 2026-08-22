/**
 * Thin CLI entrypoint: PlayHQ -> D1. Collect lives in
 * `src/pipeline/fetch/collect.ts`; this file wires the local raw cache and
 * the wrangler D1 executor. Generated entity CSVs are not written.
 *
 * Usage:
 *   pnpm exec tsx scripts/fetch-playhq.ts [--refresh] [--remote]
 *     [--games] [--year=2026 ...] [--grade=<playhq id>]
 *     [--org=<playhq org id>] [--competition=<catalogue key>]
 *
 * Default walk is AMND + Netball SA + metro associations in COLLECT_JOBS.
 * Pass `--org` or `--competition` to target one catalogue key. New
 * association jobs start at 2023. `--remote` upserts production D1.
 */
import { isNull, isUndefined } from 'es-toolkit';
import { runFetch } from '../src/pipeline/fetch/run.ts';
import { createWranglerExecutor } from '../src/pipeline/import/executors.ts';
import type { WranglerTarget } from '../src/pipeline/import/executors.ts';
import { ImportValidationError } from '../src/pipeline/import/types.ts';
import { COMPETITION_SEEDS } from '../src/pipeline/seed/catalogue.ts';

const refresh = process.argv.includes('--refresh');
const games = process.argv.includes('--games');
const target: WranglerTarget = process.argv.includes('--remote')
    ? 'remote'
    : 'local';
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

const executor = createWranglerExecutor('netball-stats', target);

try {
    const report = await runFetch({
        executor,
        games,
        gradeId,
        orgIds: orgIdsFromFlags(),
        refresh,
        years,
    });

    console.warn(
        `fetched ${report.seasons} seasons, ${report.grades} grades, ${report.teams} teams, ${report.results} results, ${report.games} games → D1 (${target})`,
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
    for (const warning of report.imported.warnings) {
        console.warn(
            `warning: grade ${warning.gradeKey} team_count ${warning.teamCount} vs ${warning.previousGradeKey} team_count ${warning.previousTeamCount} — check for a broken scrape`,
        );
    }
    for (const mismatch of report.imported.playedMismatchWarnings) {
        console.warn(
            `warning: ${mismatch.gradeKey} ${mismatch.clubKey} (${mismatch.displayName}) — played=${mismatch.played} but won+drawn+lost=${mismatch.won + mismatch.drawn + mismatch.lost}; imported unchanged, annotated in notes`,
        );
    }
} catch (error) {
    if (error instanceof ImportValidationError) {
        console.error(`import failed: ${error.message}`);
        process.exitCode = 1;
    } else {
        throw error;
    }
}
