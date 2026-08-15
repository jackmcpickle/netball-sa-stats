import { and, desc, eq, gte, lt } from 'drizzle-orm';
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
        id: row.id,
        instanceId: row.instanceId,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        status: row.status,
        yearsJson: row.yearsJson,
        games: row.games,
        seasons: row.seasons,
        grades: row.grades,
        teams: row.teams,
        results: row.results,
        gamesCount: row.gamesCount,
        warningsJson: row.warningsJson,
        errorText: row.errorText,
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
        async list(): Promise<ImportRun[]> {
            const rows = await db
                .select()
                .from(importRuns)
                .orderBy(desc(importRuns.startedAt), desc(importRuns.id));
            return rows.map(toImportRun);
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

        async hasRunning(): Promise<boolean> {
            const row = await db
                .select({ id: importRuns.id })
                .from(importRuns)
                .where(eq(importRuns.status, 'running'))
                .get();
            return row !== undefined;
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
            return row !== undefined;
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

        async insertRunning(input): Promise<number> {
            const [row] = await db
                .insert(importRuns)
                .values({
                    instanceId: input.instanceId,
                    startedAt: input.startedAt,
                    status: 'running',
                    yearsJson: input.yearsJson,
                    games: input.games,
                })
                .returning({ id: importRuns.id });
            return row.id;
        },

        async insertSkipped(input): Promise<number> {
            const [row] = await db
                .insert(importRuns)
                .values({
                    instanceId: input.instanceId,
                    startedAt: input.startedAt,
                    finishedAt: input.finishedAt,
                    status: 'skipped',
                    yearsJson: input.yearsJson,
                    games: input.games,
                })
                .returning({ id: importRuns.id });
            return row.id;
        },

        async markSkipped(id: number, finishedAt: number): Promise<void> {
            await db
                .update(importRuns)
                .set({ status: 'skipped', finishedAt })
                .where(eq(importRuns.id, id));
        },

        async markOk(id, finishedAt, counts): Promise<void> {
            await db
                .update(importRuns)
                .set({
                    status: 'ok',
                    finishedAt,
                    seasons: counts.seasons,
                    grades: counts.grades,
                    teams: counts.teams,
                    results: counts.results,
                    gamesCount: counts.gamesCount,
                    warningsJson: counts.warningsJson,
                })
                .where(eq(importRuns.id, id));
        },

        async markError(id, finishedAt, errorText): Promise<void> {
            await db
                .update(importRuns)
                .set({ status: 'error', finishedAt, errorText })
                .where(eq(importRuns.id, id));
        },
    };
}
