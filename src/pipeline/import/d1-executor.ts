/**
 * The one `ImportExecutor` that is safe to import from a Worker.
 *
 * `executors.ts` also exports the CLI implementations, which pull in
 * `node:sqlite` and `node:child_process` — importing that module from the
 * Workflow would break the whole Worker bundle, so the D1 binding lives on
 * its own here.
 */
import type { ImportExecutor } from '@/pipeline/import/types';

/** D1 binding from a Worker or test fake — same SQL interface as sqlite. */
export function createD1Executor(db: D1Database): ImportExecutor {
    return {
        batch: async (batch) => {
            await db.batch(batch.map((sql) => db.prepare(sql)));
        },
        queryAll: async (sql) => {
            const result = await db.prepare(sql).all();
            return result.results ?? [];
        },
    };
}
