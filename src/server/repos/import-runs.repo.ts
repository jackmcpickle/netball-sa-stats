import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { isUndefined } from 'es-toolkit';
import type { Db } from '@/db';
import { importRuns } from '@/db/schema';
import type { ImportRunStatus } from '@/db/schema';

export interface ImportRun {
    id: number;
    instanceId: string;
    startedAt: number;
    finishedAt: number | null;
    status: ImportRunStatus;
    yearsJson: string | null;
    games: boolean;
    seasons: number | null;
    grades: number | null;
    teams: number | null;
    results: number | null;
    gamesCount: number | null;
    warningsJson: string | null;
    errorText: string | null;
}

function toImportRun(row: typeof importRuns.$inferSelect): ImportRun {
    return {
        errorText: row.errorText,
        finishedAt: row.finishedAt,
        games: row.games,
        gamesCount: row.gamesCount,
        grades: row.grades,
        id: row.id,
        instanceId: row.instanceId,
        results: row.results,
        seasons: row.seasons,
        startedAt: row.startedAt,
        status: row.status,
        teams: row.teams,
        warningsJson: row.warningsJson,
        yearsJson: row.yearsJson,
    };
}

export interface ImportRunsRepo {
    readonly list: () => Promise<ImportRun[]>;
    readonly lastSuccessAt: () => Promise<number | null>;
    readonly hasRunning: () => Promise<boolean>;
    readonly hasRunningSince: (epochSeconds: number) => Promise<boolean>;
    readonly runningOlderThan: (epochSeconds: number) => Promise<ImportRun[]>;
    readonly insertRunning: (input: {
        instanceId: string;
        startedAt: number;
        yearsJson: string | null;
        games: boolean;
    }) => Promise<number>;
    readonly insertSkipped: (input: {
        instanceId: string;
        startedAt: number;
        yearsJson: string | null;
        games: boolean;
        finishedAt: number;
    }) => Promise<number>;
    readonly markSkipped: (id: number, finishedAt: number) => Promise<void>;
    readonly markOk: (
        id: number,
        finishedAt: number,
        counts: {
            seasons: number;
            grades: number;
            teams: number;
            results: number;
            gamesCount: number;
            warningsJson: string;
        },
    ) => Promise<void>;
    readonly markError: (
        id: number,
        finishedAt: number,
        errorText: string,
    ) => Promise<void>;
}

export function createImportRunsRepo(db: Db): ImportRunsRepo {
    return {
        async hasRunning(): Promise<boolean> {
            const row = await db
                .select({ id: importRuns.id })
                .from(importRuns)
                .where(eq(importRuns.status, 'running'))
                .get();
            return !isUndefined(row);
        },

        /** A `running` row young enough that a real import may still hold it. */
        async hasRunningSince(epochSeconds: number): Promise<boolean> {
            const row = await db
                .select({ id: importRuns.id })
                .from(importRuns)
                .where(
                    and(
                        eq(importRuns.status, 'running'),
                        gte(importRuns.startedAt, epochSeconds),
                    ),
                )
                .get();
            return !isUndefined(row);
        },

        async insertRunning(input): Promise<number> {
            const [row] = await db
                .insert(importRuns)
                .values({
                    games: input.games,
                    instanceId: input.instanceId,
                    startedAt: input.startedAt,
                    status: 'running',
                    yearsJson: input.yearsJson,
                })
                .returning({ id: importRuns.id });
            return row.id;
        },

        async insertSkipped(input): Promise<number> {
            const [row] = await db
                .insert(importRuns)
                .values({
                    finishedAt: input.finishedAt,
                    games: input.games,
                    instanceId: input.instanceId,
                    startedAt: input.startedAt,
                    status: 'skipped',
                    yearsJson: input.yearsJson,
                })
                .returning({ id: importRuns.id });
            return row.id;
        },

        /**
         * When the dataset was last refreshed, for the public "last updated"
         * line. Only `ok` runs count — a failed import changed nothing.
         */
        async lastSuccessAt(): Promise<number | null> {
            const row = await db
                .select({ finishedAt: importRuns.finishedAt })
                .from(importRuns)
                .where(eq(importRuns.status, 'ok'))
                .orderBy(desc(importRuns.finishedAt))
                .get();
            return row?.finishedAt ?? null;
        },

        async list(): Promise<ImportRun[]> {
            const rows = await db
                .select()
                .from(importRuns)
                .orderBy(desc(importRuns.startedAt), desc(importRuns.id));
            return rows.map(toImportRun);
        },

        async markError(id, finishedAt, errorText): Promise<void> {
            await db
                .update(importRuns)
                .set({ errorText, finishedAt, status: 'error' })
                .where(eq(importRuns.id, id));
        },

        async markOk(id, finishedAt, counts): Promise<void> {
            await db
                .update(importRuns)
                .set({
                    finishedAt,
                    gamesCount: counts.gamesCount,
                    grades: counts.grades,
                    results: counts.results,
                    seasons: counts.seasons,
                    status: 'ok',
                    teams: counts.teams,
                    warningsJson: counts.warningsJson,
                })
                .where(eq(importRuns.id, id));
        },

        async markSkipped(id: number, finishedAt: number): Promise<void> {
            await db
                .update(importRuns)
                .set({ finishedAt, status: 'skipped' })
                .where(eq(importRuns.id, id));
        },

        async runningOlderThan(epochSeconds: number): Promise<ImportRun[]> {
            const rows = await db
                .select()
                .from(importRuns)
                .where(
                    and(
                        eq(importRuns.status, 'running'),
                        lt(importRuns.startedAt, epochSeconds),
                    ),
                );
            return rows.map(toImportRun);
        },
    };
}
