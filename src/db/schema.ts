import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const teams = sqliteTable('teams', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    createdAt: text('created_at')
        .notNull()
        .default(sql`(current_timestamp)`),
});

export const players = sqliteTable('players', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    teamId: integer('team_id')
        .notNull()
        .references(() => teams.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: text('position'),
    createdAt: text('created_at')
        .notNull()
        .default(sql`(current_timestamp)`),
});

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
