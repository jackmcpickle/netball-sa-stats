/**
 * Worker/CLI-agnostic PlayHQ import job: lock → collect → subset upsert →
 * record. No Workflow class, R2, or live PlayHQ client lives here.
 */
import type { CsvValue } from '@/pipeline/csv';
import type { CaptureStore } from '@/pipeline/fetch/capture-store';
import type { ClubRegistry } from '@/pipeline/fetch/club-registry';
import { clubRegistryFromExecutor } from '@/pipeline/fetch/club-registry-from-db';
import {
    collectPlayHqData,
    type CollectedPlayHq,
    type FetchReport,
    type GradeRow,
    type SeasonRow,
    type TeamRow,
} from '@/pipeline/fetch/collect';
import type { GameRow } from '@/pipeline/fetch/games';
import { toImportData } from '@/pipeline/fetch/to-import';
import { runImportData, type ImportReport } from '@/pipeline/import/run';
import type { ImportExecutor } from '@/pipeline/import/types';
import { createImportRunsRepo } from '@/server/repos/import-runs.repo';

/** Job policy: a `running` row older than this is treated as crashed. */
const STALE_AFTER_SECONDS = 7200;

export type PlayHqJobParams = { years?: number[]; games: boolean };

function stringifyIsFinal(value: unknown): string {
    if (value === true || value === 1 || value === '1') return '1';
    return '0';
}

/** Curated `seasons.is_final` as CSV `'0'`/`'1'` so collect cannot clobber it. */
export async function loadIsFinalMap(
    executor: ImportExecutor,
): Promise<ReadonlyMap<string, string>> {
    const rows = await executor.queryAll(
        'SELECT season_key, is_final FROM seasons;',
    );
    const map = new Map<string, string>();
    for (const row of rows) {
        if (typeof row.season_key !== 'string' || row.season_key.length === 0) {
            continue;
        }
        map.set(row.season_key, stringifyIsFinal(row.is_final));
    }
    return map;
}

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

/**
 * Wall-clock completion time, distinct from `nowEpochSeconds` (which stamps
 * `startedAt` and the stale-lock cutoff). A collect can run for minutes, so
 * reusing the start instant here would report every import as instantaneous.
 */
function finishedNow(): number {
    return Math.floor(Date.now() / 1000);
}

/**
 * Grades the collect walked past. The scheduled import has no console to
 * print to, so these ride along in `warningsJson` exactly as the CLI prints
 * them — a grade quietly dropping out of scope is how a season goes missing.
 */
function skippedGradeWarnings(
    skippedGrades: FetchReport['skippedGrades'],
): string[] {
    return skippedGrades.map((skipped) => {
        const detail =
            skipped.reason === 'too_few_teams'
                ? `too_few_teams (${skipped.teamCount} team(s))`
                : 'out_of_scope (not a catalogued competition)';
        return `warning: skipped grade ${skipped.seasonKey} / ${skipped.gradeName} — ${detail}`;
    });
}

/**
 * Clubs the registry minted during this collect. A club created from a
 * PlayHQ organisation name is a guess until a human curates it, so surface
 * each one rather than letting it appear silently in the database.
 */
function newClubWarnings(
    clubRegistry: ClubRegistry,
    knownClubKeys: ReadonlySet<string>,
): string[] {
    return clubRegistry
        .getClubs()
        .filter((club) => !knownClubKeys.has(club.club_key))
        .map(
            (club) =>
                `warning: new club ${club.club_key} (${club.name}, playhq_id=${club.playhq_id ?? 'null'}) — curate later`,
        );
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
    // A fresh `running` row wins outright, even when a stale one sits beside
    // it: reaping the stale row is not permission to start a second import
    // alongside the one that is genuinely still going.
    if (await input.runs.hasRunningSince(cutoff)) {
        await input.runs.insertSkipped({
            instanceId: input.instanceId,
            startedAt: input.nowEpochSeconds,
            yearsJson: input.yearsJson,
            games: input.games,
            finishedAt: finishedNow(),
        });
        return { skipped: true };
    }
    for (const row of await input.runs.runningOlderThan(cutoff)) {
        // eslint-disable-next-line no-await-in-loop -- serial by design; do not Promise.all PlayHQ-adjacent work
        await input.runs.markError(row.id, finishedNow(), 'stale running row');
    }
    return input.runs.insertRunning({
        instanceId: input.instanceId,
        startedAt: input.nowEpochSeconds,
        yearsJson: input.yearsJson,
        games: input.games,
    });
}

type JobOutcome = {
    report: ImportReport;
    /** Warnings the collect produced, which `ImportReport` cannot carry. */
    collectWarnings: string[];
};

async function collectAndImport(input: PlayHqJobInput): Promise<JobOutcome> {
    const collect = input.collect ?? collectPlayHqData;
    const clubRegistry = await clubRegistryFromExecutor(
        input.executor.queryAll,
    );
    const knownClubKeys = new Set(
        clubRegistry.getClubs().map((club) => club.club_key),
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
    return {
        report: await runImportData(data, input.executor, 'subset'),
        collectWarnings: [
            ...skippedGradeWarnings(collected.report.skippedGrades),
            ...newClubWarnings(clubRegistry, knownClubKeys),
        ],
    };
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
        const { report, collectWarnings } = await collectAndImport(input);
        await input.runs.markOk(lock, finishedNow(), {
            seasons: report.seasons,
            grades: report.grades,
            teams: report.teams,
            results: report.results,
            gamesCount: report.games,
            warningsJson: JSON.stringify([
                ...warningMessages(report),
                ...collectWarnings,
            ]),
        });
        return report;
    } catch (error) {
        await input.runs.markError(lock, finishedNow(), errorMessage(error));
        throw error;
    }
}
