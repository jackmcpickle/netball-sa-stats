import { and, desc, eq, gte, lt } from 'drizzle-orm';
import type { Db } from '@/db';
import { importRuns, type ImportRunStatus } from '@/db/schema';

export type ImportRun = {
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
};

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

export function createImportRunsRepo(db: Db): {
    list(): Promise<ImportRun[]>;
    hasRunning(): Promise<boolean>;
    hasRunningSince(epochSeconds: number): Promise<boolean>;
    runningOlderThan(epochSeconds: number): Promise<ImportRun[]>;
    insertRunning(input: {
        instanceId: string;
        startedAt: number;
        yearsJson: string | null;
        games: boolean;
    }): Promise<number>;
    insertSkipped(input: {
        instanceId: string;
        startedAt: number;
        yearsJson: string | null;
        games: boolean;
        finishedAt: number;
    }): Promise<number>;
    markSkipped(id: number, finishedAt: number): Promise<void>;
    markOk(
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
    ): Promise<void>;
    markError(id: number, finishedAt: number, errorText: string): Promise<void>;
} {
    return {
        async list(): Promise<ImportRun[]> {
            const rows = await db
                .select()
                .from(importRuns)
                .orderBy(desc(importRuns.startedAt), desc(importRuns.id));
            return rows.map(toImportRun);
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
