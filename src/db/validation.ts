import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { players, teams } from '@/db/schema';

export const teamSelectSchema = createSelectSchema(teams);
export const teamInsertSchema = createInsertSchema(teams, {
    name: z.string().min(1).max(80),
}).omit({ id: true, createdAt: true });

export const playerSelectSchema = createSelectSchema(players);
export const playerInsertSchema = createInsertSchema(players, {
    name: z.string().min(1).max(80),
    position: z.string().max(20).nullable().optional(),
}).omit({ id: true, createdAt: true });

export type TeamInsert = z.infer<typeof teamInsertSchema>;
export type PlayerInsert = z.infer<typeof playerInsertSchema>;
