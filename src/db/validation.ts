import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
    COMPETITION_PERIODS,
    PLACEMENT_BASES,
    SOURCES,
    clubAliases,
    clubs,
    competitions,
    gradeWeights,
    grades,
    seasons,
    teamSeasonResults,
    teams,
} from '@/db/schema';

const omitGenerated = { id: true, createdAt: true } as const;

const key = z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_-]+$/u, 'lowercase, digits, hyphens and underscores only');

const name = z.string().min(1).max(120);

export const competitionSelectSchema = createSelectSchema(competitions);
export const competitionInsertSchema = createInsertSchema(competitions, {
    key,
    name,
}).omit(omitGenerated);

export const seasonSelectSchema = createSelectSchema(seasons);
export const seasonInsertSchema = createInsertSchema(seasons, {
    seasonKey: key,
    label: name,
    competitionPeriod: z.enum(COMPETITION_PERIODS),
    source: z.enum(SOURCES),
    startYear: z.int().min(1900).max(2100),
    endYear: z.int().min(1900).max(2100),
})
    .omit(omitGenerated)
    // Summer spans two years, everything else sits within one.
    .refine(
        (s) =>
            s.competitionPeriod === 'summer'
                ? s.endYear === s.startYear + 1
                : s.endYear === s.startYear,
        {
            message: 'endYear must be startYear (+1 for summer)',
            path: ['endYear'],
        },
    );

export const clubSelectSchema = createSelectSchema(clubs);
export const clubInsertSchema = createInsertSchema(clubs, {
    clubKey: key,
    name,
}).omit(omitGenerated);

export const clubAliasSelectSchema = createSelectSchema(clubAliases);
export const clubAliasInsertSchema = createInsertSchema(clubAliases, {
    aliasText: z.string().min(1).max(120),
}).omit(omitGenerated);

export const gradeSelectSchema = createSelectSchema(grades);
export const gradeInsertSchema = createInsertSchema(grades, {
    gradeKey: key,
    name,
    tier: z.int().min(1).max(20),
    division: z.int().min(1).max(20).nullable().optional(),
    teamCount: z.int().min(1).max(64),
}).omit(omitGenerated);

export const teamSelectSchema = createSelectSchema(teams);
export const teamInsertSchema = createInsertSchema(teams, {
    displayName: name,
    squadNumber: z.int().min(1).max(20).nullable().optional(),
}).omit(omitGenerated);

const count = z.int().min(0).max(200);

export const teamSeasonResultSelectSchema =
    createSelectSchema(teamSeasonResults);
export const teamSeasonResultInsertSchema = createInsertSchema(
    teamSeasonResults,
    {
        ladderPosition: z.int().min(1).max(64),
        played: count.nullable().optional(),
        won: count.nullable().optional(),
        drawn: count.nullable().optional(),
        lost: count.nullable().optional(),
        byes: count.nullable().optional(),
        goalsFor: z.int().min(0).nullable().optional(),
        goalsAgainst: z.int().min(0).nullable().optional(),
        percentage: z.number().min(0).nullable().optional(),
        source: z.enum(SOURCES),
        placementBasis: z.enum(PLACEMENT_BASES),
    },
).omit(omitGenerated);
// `played = won + drawn + lost` is intentionally NOT a schema-level refine:
// PlayHQ's own upstream ladder data violates it for ~1.6% of rows (verified
// against the raw capture — `byes` does not explain it either). The importer
// (`src/pipeline/import/validate.ts`) checks this separately and downgrades
// it to a warning rather than a hard failure, annotating the affected row's
// `notes` instead of rejecting it. Every other field rule here still applies.

export const gradeWeightSelectSchema = createSelectSchema(gradeWeights);
export const gradeWeightInsertSchema = createInsertSchema(gradeWeights, {
    label: name,
    tier: z.int().min(1).max(20),
    division: z.int().min(1).max(20).nullable().optional(),
    weight: z.number().min(0).max(1),
}).omit(omitGenerated);

export type CompetitionInsert = z.infer<typeof competitionInsertSchema>;
export type SeasonInsert = z.infer<typeof seasonInsertSchema>;
export type ClubInsert = z.infer<typeof clubInsertSchema>;
export type ClubAliasInsert = z.infer<typeof clubAliasInsertSchema>;
export type GradeInsert = z.infer<typeof gradeInsertSchema>;
export type TeamInsert = z.infer<typeof teamInsertSchema>;
export type TeamSeasonResultInsert = z.infer<
    typeof teamSeasonResultInsertSchema
>;
export type GradeWeightInsert = z.infer<typeof gradeWeightInsertSchema>;
