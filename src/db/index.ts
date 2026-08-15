import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
// oxlint-disable-next-line sonarjs/no-wildcard-import -- drizzle's typed relational API needs the whole schema namespace object, both as the `Db` type parameter and as the `drizzle()` option
import * as schema from '@/db/schema';

/** Common supertype of the D1 handle (prod) and the sqlite-proxy handle (tests). */
export type Db = BaseSQLiteDatabase<'async', unknown, typeof schema>;

export function getDb(): Db {
    return drizzle(env.DB, { casing: 'snake_case', schema });
}
