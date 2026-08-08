import { env } from 'cloudflare:workers';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@/db/schema';

export type Db = DrizzleD1Database<typeof schema>;

export function getDb(): Db {
    return drizzle(env.DB, { schema, casing: 'snake_case' });
}
