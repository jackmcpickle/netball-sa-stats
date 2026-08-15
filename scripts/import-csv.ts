/**
 * Thin CLI entrypoint for stage 2 of the pipeline: `data/*.csv` -> D1. All
 * logic lives in `src/pipeline/import/run.ts` (globbed for tests under
 * `src/**`, this file is not).
 *
 * Usage:
 *   pnpm exec tsx scripts/import-csv.ts [--remote]
 *
 * Defaults to `--local` (the D1 database migrated via `db:migrate:local`).
 * Requires migrations to already be applied — this importer does not write
 * `competitions` or `grade_weights`, only verifies they're present.
 */
import { resolve } from 'node:path';
import { createWranglerExecutor } from '../src/pipeline/import/executors.ts';
import type { WranglerTarget } from '../src/pipeline/import/executors.ts';
import { runImport } from '../src/pipeline/import/run.ts';
import { ImportValidationError } from '../src/pipeline/import/types.ts';

const target: WranglerTarget = process.argv.includes('--remote')
    ? 'remote'
    : 'local';

const dataDir = resolve(import.meta.dirname, '..', 'data');
const executor = createWranglerExecutor('netball-stats', target);

try {
    const report = await runImport({ dataDir, executor });
    console.warn(
        `imported ${report.seasons} seasons, ${report.clubs} clubs, ${report.clubAliases} club aliases, ${report.grades} grades, ${report.teams} teams, ${report.results} results (${target})`,
    );
    for (const warning of report.warnings) {
        console.warn(
            `warning: grade ${warning.gradeKey} team_count ${warning.teamCount} vs ${warning.previousGradeKey} team_count ${warning.previousTeamCount} — check for a broken scrape`,
        );
    }
    for (const mismatch of report.playedMismatchWarnings) {
        console.warn(
            `warning: ${mismatch.gradeKey} ${mismatch.clubKey} (${mismatch.displayName}) — played=${mismatch.played} but won+drawn+lost=${mismatch.won + mismatch.drawn + mismatch.lost}; imported unchanged, annotated in notes`,
        );
    }
    if (report.playedMismatchWarnings.length > 0) {
        console.warn(
            `${report.playedMismatchWarnings.length} row(s) had a played/won+drawn+lost mismatch (upstream PlayHQ data) — imported unchanged, see notes`,
        );
    }
    for (const unresolved of report.unresolvedTeamWarnings) {
        console.warn(
            `warning: ${unresolved.file}:${unresolved.line} ${unresolved.gradeKey} game ${unresolved.playhqId} references team(s) ${unresolved.missingTeamIds.join(', ')} that appear on no ladder — game skipped, never invented`,
        );
    }
    if (report.unresolvedTeamWarnings.length > 0) {
        console.warn(
            `${report.unresolvedTeamWarnings.length} game(s) skipped for an unresolvable team (a withdrawal). Many of these at once means a mapping fault, not a withdrawal.`,
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
