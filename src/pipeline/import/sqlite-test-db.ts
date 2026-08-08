/**
 * Builds an in-memory sqlite database migrated exactly like local/remote D1,
 * for tests only. No network, no live D1, no new dependency — `node:sqlite`
 * ships with Node 22+.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

export async function createMigratedDb(): Promise<DatabaseSync> {
    const db = new DatabaseSync(':memory:');
    const init = await readFile(resolve(ROOT, 'drizzle/0000_init.sql'), 'utf8');
    const seed = await readFile(resolve(ROOT, 'drizzle/0001_seed.sql'), 'utf8');
    db.exec(init.replaceAll('--> statement-breakpoint', ''));
    db.exec(seed);
    return db;
}
