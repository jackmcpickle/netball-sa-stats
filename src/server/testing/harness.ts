/**
 * In-memory drizzle test harness: migrates a `node:sqlite` database exactly
 * like local/remote D1 and wraps it with drizzle's sqlite-proxy driver so
 * tests can exercise real drizzle queries without `cloudflare:workers`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
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
        const sql = readFileSync(resolve(dir, file), 'utf8');
        sqlite.exec(sql.replaceAll('--> statement-breakpoint', ''));
    }
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
            stmt.setReturnArrays(true);
            const rows = stmt.all(
                ...(params as SQLInputValue[]),
            ) as unknown as unknown[][];
            return method === 'get' ? { rows: rows[0] ?? [] } : { rows };
        },
        { schema, casing: 'snake_case' },
    );
}
