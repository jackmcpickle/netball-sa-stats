import { isNull, isUndefined } from 'es-toolkit';
import { NO_VALUE } from '@/components/format';
import { err, ok } from '@/server/domain/result';
import type { Result } from '@/server/domain/result';
import type { AdminPageDto, AdminRunDto } from '@/server/dto/admin.dto';
import { IMPORT_RUN_STALE_AFTER_SECONDS } from '@/server/repos/import-runs.repo';
import type {
    ImportRun,
    ImportRunsRepo,
} from '@/server/repos/import-runs.repo';

export type StartImport = (params: {
    years?: number[];
    games: boolean;
}) => Promise<void>;

/** Mirrors the Workers `CachePurgeResult`, so tests need no runtime types. */
export interface PurgeCacheResult {
    readonly success: boolean;
    readonly errors: readonly { readonly message: string }[];
}

export type PurgeCache = () => Promise<PurgeCacheResult>;

export interface AdminService {
    readonly getPage: () => Promise<AdminPageDto>;
    readonly runImport: (
        yearsText: string,
    ) => Promise<Result<true, RunImportError>>;
    readonly clearPageCache: () => Promise<Result<true, ClearCacheError>>;
}

export type RunImportError =
    | { kind: 'already-running' }
    | { kind: 'bad-years' };

export interface ClearCacheError {
    readonly kind: 'purge-failed';
    readonly message: string;
}

const YEAR_TOKEN = /^\d{4}$/u;

const startedFormatter = new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Adelaide',
});

function formatStartedLabel(startedAt: number): string {
    return startedFormatter.format(new Date(startedAt * 1000));
}

function formatDuration(elapsedSeconds: number): string {
    const safe = Math.max(0, elapsedSeconds);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe - hours * 3600) / 60);
    if (hours === 0) {
        return `${String(minutes)}m`;
    }
    return `${String(hours)}h ${String(minutes)}m`;
}

function durationLabel(run: ImportRun, nowEpochSeconds: number): string {
    if (run.status === 'running') {
        return formatDuration(nowEpochSeconds - run.startedAt);
    }
    if (isNull(run.finishedAt)) {
        return NO_VALUE;
    }
    return formatDuration(run.finishedAt - run.startedAt);
}

function parseWarnings(json: string | null): readonly string[] {
    if (isNull(json)) {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(json);
        if (!Array.isArray(parsed)) {
            return [];
        }
        const warnings: string[] = [];
        for (const item of parsed) {
            // oxlint-disable-next-line anti-slop/no-runtime-typeof -- this IS the I/O boundary parse: `warningsJson` is untrusted JSON text and each element must be checked before it can be treated as a domain string
            if (typeof item !== 'string') {
                return [];
            }
            warnings.push(item);
        }
        return warnings;
    } catch {
        return [];
    }
}

function toRunDto(run: ImportRun, nowEpochSeconds: number): AdminRunDto {
    const warnings = parseWarnings(run.warningsJson);
    return {
        durationLabel: durationLabel(run, nowEpochSeconds),
        errorText: run.errorText,
        gamesCount: run.gamesCount,
        grades: run.grades,
        id: run.id,
        seasons: run.seasons,
        startedLabel: formatStartedLabel(run.startedAt),
        status: run.status,
        warningCount: warnings.length,
        warnings,
    };
}

function parseYears(
    yearsText: string,
): Result<number[] | undefined, { kind: 'bad-years' }> {
    const trimmed = yearsText.trim();
    if (trimmed.length === 0) {
        return ok(undefined);
    }
    const years: number[] = [];
    for (const token of trimmed.split(',')) {
        const yearToken = token.trim();
        if (!YEAR_TOKEN.test(yearToken)) {
            return err({ kind: 'bad-years' });
        }
        years.push(Number(yearToken));
    }
    return ok(years);
}

async function unboundPurgeCache(): Promise<PurgeCacheResult> {
    throw new Error('Workers Cache is not bound');
}

export function createAdminService(
    repo: ImportRunsRepo,
    deps: { startImport: StartImport; purgeCache?: PurgeCache },
): AdminService {
    const purgeCache = deps.purgeCache ?? unboundPurgeCache;
    return {
        /**
         * Pages sit in Workers Cache for up to two hours, so a season marked
         * final by hand would otherwise keep showing its old standing.
         */
        async clearPageCache(): Promise<Result<true, ClearCacheError>> {
            const result = await purgeCache();
            if (!result.success) {
                const message = result.errors
                    .map((error) => error.message)
                    .join('; ');
                return err({
                    kind: 'purge-failed',
                    message: message.length > 0 ? message : 'unknown error',
                });
            }
            return ok(true);
        },

        async getPage(): Promise<AdminPageDto> {
            const nowEpochSeconds = Math.floor(Date.now() / 1000);
            const runs = await repo.list();
            const dtos = runs.map((run) => toRunDto(run, nowEpochSeconds));
            const runningRun = dtos.find((run) => run.status === 'running');
            return {
                lastStatus: dtos[0]?.status ?? null,
                running: !isUndefined(runningRun),
                runningElapsedLabel: runningRun?.durationLabel ?? null,
                runs: dtos,
            };
        },

        async runImport(
            yearsText: string,
        ): Promise<Result<true, RunImportError>> {
            // A crashed workflow never finishes its row; past the stale cutoff
            // the job reaps it, so it must not block the cron or this button.
            const cutoff =
                Math.floor(Date.now() / 1000) - IMPORT_RUN_STALE_AFTER_SECONDS;
            if (await repo.hasRunningSince(cutoff)) {
                return err({ kind: 'already-running' });
            }
            const years = parseYears(yearsText);
            if (!years.ok) {
                return years;
            }
            await deps.startImport(
                isUndefined(years.value)
                    ? { games: true }
                    : { games: true, years: years.value },
            );
            return ok(true);
        },
    };
}
