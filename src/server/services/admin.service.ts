import { NO_VALUE } from '@/components/format';
import { err, ok } from '@/server/domain/result';
import type { Result } from '@/server/domain/result';
import type { AdminPageDto, AdminRunDto } from '@/server/dto/admin.dto';
import type {
    ImportRun,
    ImportRunsRepo,
} from '@/server/repos/import-runs.repo';

export type StartImport = (params: {
    years?: number[];
    games: boolean;
}) => Promise<void>;

export interface AdminService {
    readonly getPage: () => Promise<AdminPageDto>;
    readonly runImport: (
        yearsText: string,
    ) => Promise<Result<true, RunImportError>>;
}

export type RunImportError =
    | { kind: 'already-running' }
    | { kind: 'bad-years' };

const YEAR_TOKEN = /^\d{4}$/u;

const startedFormatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Adelaide',
    dateStyle: 'medium',
    timeStyle: 'short',
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
    if (run.finishedAt === null) {
        return NO_VALUE;
    }
    return formatDuration(run.finishedAt - run.startedAt);
}

function parseWarnings(json: string | null): readonly string[] {
    if (json === null) {
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
        id: run.id,
        startedLabel: formatStartedLabel(run.startedAt),
        status: run.status,
        seasons: run.seasons,
        grades: run.grades,
        gamesCount: run.gamesCount,
        warningCount: warnings.length,
        durationLabel: durationLabel(run, nowEpochSeconds),
        errorText: run.errorText,
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

export function createAdminService(
    repo: ImportRunsRepo,
    deps: { startImport: StartImport },
): AdminService {
    return {
        async getPage(): Promise<AdminPageDto> {
            const nowEpochSeconds = Math.floor(Date.now() / 1000);
            const runs = await repo.list();
            const dtos = runs.map((run) => toRunDto(run, nowEpochSeconds));
            const runningRun = dtos.find((run) => run.status === 'running');
            return {
                running: runningRun !== undefined,
                runningElapsedLabel: runningRun?.durationLabel ?? null,
                lastStatus: dtos[0]?.status ?? null,
                runs: dtos,
            };
        },

        async runImport(
            yearsText: string,
        ): Promise<Result<true, RunImportError>> {
            if (await repo.hasRunning()) {
                return err({ kind: 'already-running' });
            }
            const years = parseYears(yearsText);
            if (!years.ok) {
                return years;
            }
            await deps.startImport(
                years.value === undefined
                    ? { games: true }
                    : { years: years.value, games: true },
            );
            return ok(true);
        },
    };
}
