/**
 * In-memory drizzle test harness: migrates a `node:sqlite` database exactly
 * like local/remote D1 and wraps it with drizzle's sqlite-proxy driver so
 * tests can exercise real drizzle queries without `cloudflare:workers`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import type { Db } from '@/db';
import * as schema from '@/db/schema';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

function createMigratedSqlite(): DatabaseSync {
    const sqlite = new DatabaseSync(':memory:');
    const dir = resolve(ROOT, 'drizzle');
    const files = readdirSync(dir)
        .filter((name) => name.endsWith('.sql'))
        .sort();
    for (const file of files) {
        const sql = readFileSync(resolve(dir, file), 'utf-8');
        sqlite.exec(sql.replaceAll('--> statement-breakpoint', ''));
    }
    // drizzle/0001_seed.sql pre-loads `competitions` and `grade_weights`
    // (catalogue rows + championship weights). Later migrations
    // (0002/0004/0005) add to / mutate those same rows. Tests must start
    // from a genuinely empty database so seed() natural-key collisions
    // surface as errors instead of silently merging into production data.
    // `grade_weights.competition_id` cascades on delete, but node:sqlite
    // does not enforce FKs by default, so both tables are cleared explicitly.
    sqlite.exec('DELETE FROM grade_weights;');
    sqlite.exec('DELETE FROM competitions;');
    return sqlite;
}

export function createTestDb(): Db {
    const sqlite = createMigratedSqlite();

    return drizzle(
        async (sql, params, method) => {
            const stmt = sqlite.prepare(sql);
            if (method === 'run') {
                stmt.run(...(params as SQLInputValue[]));
                return { rows: [] };
            }
            // Arrays, not objects: drizzle maps sqlite-proxy rows by
            // position, and a joined query selecting `name` from two tables
            // collapses to one key in an object row — which silently shifts
            // every column after it.
            stmt.setReturnArrays(true);
            if (method === 'get') {
                const row = stmt.get(...(params as SQLInputValue[]));
                if (!row) {
                    return { rows: undefined as unknown as unknown[] };
                }
                return { rows: row as unknown as unknown[] };
            }
            return {
                rows: stmt.all(
                    ...(params as SQLInputValue[]),
                ) as unknown as unknown[][],
            };
        },
        { schema, casing: 'snake_case' },
    );
}
