/**
 * Builds an in-memory sqlite database migrated exactly like local/remote D1,
 * for tests only. No network, no live D1, no new dependency — `node:sqlite`
 * ships with Node 22+.
 */
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

/**
 * Applies *every* migration in order, not just the first two — otherwise the
 * test database silently drifts from real D1 and a table added by a later
 * migration (e.g. `games`) is missing only in tests.
 */
export async function createMigratedDb(): Promise<DatabaseSync> {
    const db = new DatabaseSync(':memory:');
    const dir = resolve(ROOT, 'drizzle');
    const files = (await readdir(dir))
        .filter((name) => name.endsWith('.sql'))
        .sort((a, b) => a.localeCompare(b));
    for (const file of files) {
        // eslint-disable-next-line no-await-in-loop -- migrations must apply in order.
        const sql = await readFile(resolve(dir, file), 'utf8');
        db.exec(sql.replaceAll('--> statement-breakpoint', ''));
    }
    return db;
}
