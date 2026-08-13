/**
 * Worker/CLI-agnostic PlayHQ import job: lock → collect → subset upsert →
 * record. No Workflow class, R2, or live PlayHQ client lives here.
 */
import type { CsvValue } from '@/pipeline/csv';
import type { CaptureStore } from '@/pipeline/fetch/capture-store';
import { clubRegistryFromExecutor } from '@/pipeline/fetch/club-registry-from-db';
import type { GameRow } from '@/pipeline/fetch/games';
import {
    collectPlayHqData,
    type CollectedPlayHq,
    type GradeRow,
    type SeasonRow,
    type TeamRow,
} from '@/pipeline/fetch/run';
import { toImportData } from '@/pipeline/fetch/to-import';
import { runImportData, type ImportReport } from '@/pipeline/import/run';
import type { ImportExecutor } from '@/pipeline/import/types';
import { createImportRunsRepo } from '@/server/repos/import-runs.repo';

/** Job policy: a `running` row older than this is treated as crashed. */
const STALE_AFTER_SECONDS = 7200;

export type PlayHqJobParams = { years?: number[]; games: boolean };

export type PlayHqJobInput = {
    params: PlayHqJobParams;
    store: CaptureStore;
    executor: ImportExecutor;
    cacheFirst: boolean;
    nowEpochSeconds: number;
    instanceId: string;
    runs: ReturnType<typeof createImportRunsRepo>;
    isFinalBySeasonKey: ReadonlyMap<string, string>;
    collect?: typeof collectPlayHqData;
};

function yearsJsonOf(years: number[] | undefined): string | null {
    return years === undefined ? null : JSON.stringify(years);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function seasonKept(season: SeasonRow, years: number[] | undefined): boolean {
    if (years !== undefined) return years.includes(season.start_year);
    return season.status === 'active';
}

function subsetCollected(
    collected: CollectedPlayHq,
    years: number[] | undefined,
): {
    seasons: SeasonRow[];
    grades: GradeRow[];
    teams: TeamRow[];
    results: Record<string, CsvValue>[];
    games: GameRow[];
} {
    const seasons = collected.seasons.filter((season) =>
        seasonKept(season, years),
    );
    const seasonKeys = new Set(seasons.map((season) => season.season_key));
    const grades = collected.grades.filter((grade) =>
        seasonKeys.has(grade.season_key),
    );
    const gradeKeys = new Set(grades.map((grade) => grade.grade_key));
    const teams = collected.teams.filter((team) =>
        gradeKeys.has(team.grade_key),
    );
    const results = collected.results.filter((row) =>
        gradeKeys.has(String(row.grade_key)),
    );
    const games = [...collected.gamesByYear.values()]
        .flat()
        .filter((game) => gradeKeys.has(game.grade_key));
    return { seasons, grades, teams, results, games };
}

function warningMessages(report: ImportReport): string[] {
    const messages: string[] = [];
    for (const warning of report.warnings) {
        messages.push(
            `warning: grade ${warning.gradeKey} team_count ${warning.teamCount} vs ${warning.previousGradeKey} team_count ${warning.previousTeamCount} — check for a broken scrape`,
        );
    }
    for (const mismatch of report.playedMismatchWarnings) {
        messages.push(
            `warning: ${mismatch.gradeKey} ${mismatch.clubKey} (${mismatch.displayName}) — played=${mismatch.played} but won+drawn+lost=${mismatch.won + mismatch.drawn + mismatch.lost}; imported unchanged, annotated in notes`,
        );
    }
    if (report.playedMismatchWarnings.length > 0) {
        messages.push(
            `${report.playedMismatchWarnings.length} row(s) had a played/won+drawn+lost mismatch (upstream PlayHQ data) — imported unchanged, see notes`,
        );
    }
    for (const unresolved of report.unresolvedTeamWarnings) {
        messages.push(
            `warning: ${unresolved.file}:${unresolved.line} ${unresolved.gradeKey} game ${unresolved.playhqId} references team(s) ${unresolved.missingTeamIds.join(', ')} that appear on no ladder — game skipped, never invented`,
        );
    }
    if (report.unresolvedTeamWarnings.length > 0) {
        messages.push(
            `${report.unresolvedTeamWarnings.length} game(s) skipped for an unresolvable team (a withdrawal). Many of these at once means a mapping fault, not a withdrawal.`,
        );
    }
    return messages;
}

async function acquireLock(input: {
    runs: PlayHqJobInput['runs'];
    nowEpochSeconds: number;
    instanceId: string;
    yearsJson: string | null;
    games: boolean;
}): Promise<number | { skipped: true }> {
    const cutoff = input.nowEpochSeconds - STALE_AFTER_SECONDS;
    const stale = await input.runs.runningOlderThan(cutoff);
    if ((await input.runs.hasRunning()) && stale.length === 0) {
        await input.runs.insertSkipped({
            instanceId: input.instanceId,
            startedAt: input.nowEpochSeconds,
            yearsJson: input.yearsJson,
            games: input.games,
            finishedAt: input.nowEpochSeconds,
        });
        return { skipped: true };
    }
    for (const row of stale) {
        // eslint-disable-next-line no-await-in-loop -- serial by design; do not Promise.all PlayHQ-adjacent work
        await input.runs.markError(
            row.id,
            input.nowEpochSeconds,
            'stale running row',
        );
    }
    return input.runs.insertRunning({
        instanceId: input.instanceId,
        startedAt: input.nowEpochSeconds,
        yearsJson: input.yearsJson,
        games: input.games,
    });
}

async function collectAndImport(input: PlayHqJobInput): Promise<ImportReport> {
    const collect = input.collect ?? collectPlayHqData;
    const clubRegistry = await clubRegistryFromExecutor(
        input.executor.queryAll,
    );
    const collected = await collect({
        store: input.store,
        cacheFirst: input.cacheFirst,
        clubRegistry,
        isFinalBySeasonKey: input.isFinalBySeasonKey,
        games: input.params.games,
        years: input.params.years,
    });
    const subset = subsetCollected(collected, input.params.years);
    const data = toImportData({
        seasons: subset.seasons,
        clubs: clubRegistry.getClubs(),
        aliases: clubRegistry.getAliases(),
        grades: subset.grades,
        teams: subset.teams,
        results: subset.results,
        games: subset.games,
    });
    return runImportData(data, input.executor, 'subset');
}

export async function runPlayHqJob(
    input: PlayHqJobInput,
): Promise<ImportReport | { skipped: true }> {
    const yearsJson = yearsJsonOf(input.params.years);
    const lock = await acquireLock({
        runs: input.runs,
        nowEpochSeconds: input.nowEpochSeconds,
        instanceId: input.instanceId,
        yearsJson,
        games: input.params.games,
    });
    if (typeof lock !== 'number') return lock;

    try {
        const report = await collectAndImport(input);
        await input.runs.markOk(lock, input.nowEpochSeconds, {
            seasons: report.seasons,
            grades: report.grades,
            teams: report.teams,
            results: report.results,
            gamesCount: report.games,
            warningsJson: JSON.stringify(warningMessages(report)),
        });
        return report;
    } catch (error) {
        await input.runs.markError(
            lock,
            input.nowEpochSeconds,
            errorMessage(error),
        );
        throw error;
    }
}
