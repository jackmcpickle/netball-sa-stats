/**
 * `ImportExecutor` implementations.
 *
 * `src/db/index.ts::getDb()` binds `env.DB` from `cloudflare:workers`, which
 * only exists inside a workerd runtime — not in a plain Node CLI. Two routes
 * were available: (a) open D1's underlying sqlite file directly (via Node's
 * built-in `node:sqlite`), which only works for `--local` and is fragile if
 * miniflare changes its on-disk layout, or (b) shell out to
 * `wrangler d1 execute`, which is the same tool `pnpm run db:migrate:*`
 * already uses and works identically for `--local` and `--remote`. We take
 * (b) for the CLI so one code path — generated SQL text — runs everywhere.
 * The tradeoff: `wrangler d1 execute` treats each invocation as its own
 * batch, so atomicity is per-chunk, not whole-import; see
 * `generateImportSql`'s chunking and the report for how we mitigate that.
 *
 * Tests use `node:sqlite`'s in-memory `DatabaseSync` directly (no CLI, no
 * live D1, no new dependency — it ships with Node 22+).
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { ImportExecutor } from '@/pipeline/import/types';

// The D1 executor lives in its own module so workerd callers never reach the
// `node:sqlite`/`node:child_process` imports above; re-exported here so the
// CLI keeps a single place to pick an executor from.
export { createD1Executor } from '@/pipeline/import/d1-executor';

export type WranglerTarget = 'local' | 'remote';

/** Runs generated SQL against local or remote D1 via `wrangler d1 execute`. */
export function createWranglerExecutor(
    databaseName: string,
    target: WranglerTarget,
): ImportExecutor {
    const targetFlag = target === 'local' ? '--local' : '--remote';

    return {
        queryAll: async (sql) => {
            const output = execFileSync(
                'pnpm',
                [
                    'exec',
                    'wrangler',
                    'd1',
                    'execute',
                    databaseName,
                    targetFlag,
                    '--json',
                    '--command',
                    sql,
                ],
                { encoding: 'utf-8' },
            );
            const parsed = JSON.parse(output) as {
                results?: Record<string, unknown>[];
            }[];
            return parsed[0]?.results ?? [];
        },
        batch: async (statements) => {
            const dir = await mkdtemp(join(tmpdir(), 'netball-import-'));
            const file = join(dir, 'batch.sql');
            try {
                await writeFile(file, `${statements.join('\n')}\n`, 'utf-8');
                execFileSync(
                    'pnpm',
                    [
                        'exec',
                        'wrangler',
                        'd1',
                        'execute',
                        databaseName,
                        targetFlag,
                        '--file',
                        file,
                    ],
                    { encoding: 'utf-8', stdio: 'inherit' },
                );
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    };
}

/** In-memory sqlite, for tests. Caller must apply schema/seed SQL first. */
export function createSqliteExecutor(db: DatabaseSync): ImportExecutor {
    return {
        queryAll: async (sql) => {
            const rows = db.prepare(sql).all() as Record<string, unknown>[];
            return rows;
        },
        batch: async (statements) => {
            db.exec(statements.join('\n'));
            return;
        },
    };
}
