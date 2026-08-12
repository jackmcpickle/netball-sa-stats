import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from '@/db/schema';

/** Common supertype of the D1 handle (prod) and the sqlite-proxy handle (tests). */
export type Db = BaseSQLiteDatabase<'async', unknown, typeof schema>;

export function getDb(): Db {
    return drizzle(env.DB, { schema, casing: 'snake_case' });
}
