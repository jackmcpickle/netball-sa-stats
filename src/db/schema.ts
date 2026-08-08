import { relations, sql } from 'drizzle-orm';
import {
    index,
    integer,
    real,
    sqliteTable,
    text,
    uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** `playhq` today; `archive_pdf` reserved for ARCHIVE-PLAN.md. */
export const SOURCES = ['playhq', 'archive_pdf'] as const;
export type Source = (typeof SOURCES)[number];

/**
 * `regular_season_ladder` is the true minor-round ladder. `final_premiership_placings`
 * comes from the archive PDFs, where the top 4 may reflect finals rather than the ladder.
 */
export const PLACEMENT_BASES = [
    'regular_season_ladder',
    'final_premiership_placings',
] as const;
export type PlacementBasis = (typeof PLACEMENT_BASES)[number];

export const COMPETITION_PERIODS = ['winter', 'summer', 'annual'] as const;
export type CompetitionPeriod = (typeof COMPETITION_PERIODS)[number];

export const competitions = sqliteTable('competitions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    playhqOrgId: text('playhq_org_id'),
    createdAt: text('created_at')
        .notNull()
        .default(sql`(current_timestamp)`),
});

export const seasons = sqliteTable(
    'seasons',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        competitionId: integer('competition_id')
            .notNull()
            .references(() => competitions.id, { onDelete: 'cascade' }),
        seasonKey: text('season_key').notNull().unique(),
        competitionPeriod: text('competition_period')
            .notNull()
            .$type<CompetitionPeriod>(),
        label: text('label').notNull(),
        startYear: integer('start_year').notNull(),
        /** Same as startYear for winter/annual; +1 for summer. */
        endYear: integer('end_year').notNull(),
        /**
         * Curated by hand in the season CSV, never inferred — a scraper cannot tell
         * a round-18 ladder from a round-22 one. In-progress seasons are excluded
         * from championship rankings.
         */
        isFinal: integer('is_final', { mode: 'boolean' })
            .notNull()
            .default(false),
        playhqId: text('playhq_id'),
        source: text('source').notNull().$type<Source>(),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(current_timestamp)`),
    },
    (t) => [
        uniqueIndex('seasons_competition_period_year_idx').on(
            t.competitionId,
            t.competitionPeriod,
            t.startYear,
        ),
    ],
);

export const clubs = sqliteTable('clubs', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clubKey: text('club_key').notNull().unique(),
    name: text('name').notNull(),
    establishedYear: integer('established_year'),
    homeVenue: text('home_venue'),
    playhqId: text('playhq_id'),
    createdAt: text('created_at')
        .notNull()
        .default(sql`(current_timestamp)`),
});

/**
 * Maps source spellings onto clubs — `C/Coasters` → City Coasters, `West/Jets` →
 * Western Jets. Import fails loudly on an unknown name rather than inventing a club:
 * once a bad run has written rows against a phantom club, untangling it is manual.
 */
export const clubAliases = sqliteTable('club_aliases', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clubId: integer('club_id')
        .notNull()
        .references(() => clubs.id, { onDelete: 'cascade' }),
    aliasText: text('alias_text').notNull().unique(),
    source: text('source').notNull(),
    createdAt: text('created_at')
        .notNull()
        .default(sql`(current_timestamp)`),
});

export const grades = sqliteTable(
    'grades',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        seasonId: integer('season_id')
            .notNull()
            .references(() => seasons.id, { onDelete: 'cascade' }),
        gradeKey: text('grade_key').notNull().unique(),
        name: text('name').notNull(),
        /** Seniority band, ordered. 1 = Premier Division. */
        tier: integer('tier').notNull(),
        /** Rank within the band, parsed from the name (B.3 → 3). */
        division: integer('division'),
        /**
         * Ladder row count. Free at scrape time and unrecoverable later without
         * re-scraping — position 4 of 6 is not position 4 of 14.
         */
        teamCount: integer('team_count').notNull(),
        ageBand: text('age_band'),
        playhqId: text('playhq_id'),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(current_timestamp)`),
    },
    (t) => [index('grades_season_idx').on(t.seasonId)],
);

/**
 * Season-scoped. No global team key: squad numbers get reassigned between seasons,
 * and clubs field several teams in one grade (`Walkerville (1)` / `(2)`).
 */
export const teams = sqliteTable(
    'teams',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        clubId: integer('club_id')
            .notNull()
            .references(() => clubs.id, { onDelete: 'cascade' }),
        gradeId: integer('grade_id')
            .notNull()
            .references(() => grades.id, { onDelete: 'cascade' }),
        displayName: text('display_name').notNull(),
        squadNumber: integer('squad_number'),
        playhqId: text('playhq_id'),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(current_timestamp)`),
    },
    (t) => [
        /**
         * Identity is (grade, playhq_id), not squad_number: PlayHQ's team id is
         * stable across re-scrapes regardless of which teammates exist in the
         * collision group, while an index-in-sorted-group synthetic squad_number
         * shifts whenever a team is added/removed from the group. squad_number
         * stays a display-only field, populated only for genuine numeric
         * suffixes ("Walkerville 1"/"2").
         */
        uniqueIndex('teams_grade_playhq_idx').on(t.gradeId, t.playhqId),
        index('teams_club_idx').on(t.clubId),
    ],
);

/** Core fact table: one row per team per grade per season. */
export const teamSeasonResults = sqliteTable(
    'team_season_results',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        teamId: integer('team_id')
            .notNull()
            .references(() => teams.id, { onDelete: 'cascade' }),
        gradeId: integer('grade_id')
            .notNull()
            .references(() => grades.id, { onDelete: 'cascade' }),
        ladderPosition: integer('ladder_position').notNull(),
        /** Archive-PDF top-4 only; always false for PlayHQ rows. */
        positionUncertain: integer('position_uncertain', { mode: 'boolean' })
            .notNull()
            .default(false),
        played: integer('played'),
        won: integer('won'),
        drawn: integer('drawn'),
        lost: integer('lost'),
        byes: integer('byes'),
        goalsFor: integer('goals_for'),
        goalsAgainst: integer('goals_against'),
        goalDifference: integer('goal_difference'),
        points: integer('points'),
        /** Goals for ÷ against × 100. */
        percentage: real('percentage'),
        shotsAttempted: integer('shots_attempted'),
        shotsScored: integer('shots_scored'),
        source: text('source').notNull().$type<Source>(),
        placementBasis: text('placement_basis')
            .notNull()
            .$type<PlacementBasis>(),
        notes: text('notes'),
        scrapedAt: integer('scraped_at'),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(current_timestamp)`),
    },
    (t) => [
        uniqueIndex('team_season_results_team_grade_idx').on(
            t.teamId,
            t.gradeId,
        ),
        index('team_season_results_grade_idx').on(t.gradeId),
    ],
);

/**
 * Championship weighting. Seeded from a formula but editable per row, and applied
 * at query time so a re-weight re-ranks every season without a re-import.
 */
export const gradeWeights = sqliteTable(
    'grade_weights',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        competitionId: integer('competition_id')
            .notNull()
            .references(() => competitions.id, { onDelete: 'cascade' }),
        tier: integer('tier').notNull(),
        division: integer('division'),
        label: text('label').notNull(),
        weight: real('weight').notNull(),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(current_timestamp)`),
    },
    (t) => [
        uniqueIndex('grade_weights_competition_tier_division_idx').on(
            t.competitionId,
            t.tier,
            t.division,
        ),
    ],
);

export const competitionsRelations = relations(competitions, ({ many }) => ({
    seasons: many(seasons),
    gradeWeights: many(gradeWeights),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
    competition: one(competitions, {
        fields: [seasons.competitionId],
        references: [competitions.id],
    }),
    grades: many(grades),
}));

export const clubsRelations = relations(clubs, ({ many }) => ({
    aliases: many(clubAliases),
    teams: many(teams),
}));

export const clubAliasesRelations = relations(clubAliases, ({ one }) => ({
    club: one(clubs, {
        fields: [clubAliases.clubId],
        references: [clubs.id],
    }),
}));

export const gradesRelations = relations(grades, ({ one, many }) => ({
    season: one(seasons, {
        fields: [grades.seasonId],
        references: [seasons.id],
    }),
    teams: many(teams),
    results: many(teamSeasonResults),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
    club: one(clubs, { fields: [teams.clubId], references: [clubs.id] }),
    grade: one(grades, { fields: [teams.gradeId], references: [grades.id] }),
    results: many(teamSeasonResults),
}));

export const teamSeasonResultsRelations = relations(
    teamSeasonResults,
    ({ one }) => ({
        team: one(teams, {
            fields: [teamSeasonResults.teamId],
            references: [teams.id],
        }),
        grade: one(grades, {
            fields: [teamSeasonResults.gradeId],
            references: [grades.id],
        }),
    }),
);

export const gradeWeightsRelations = relations(gradeWeights, ({ one }) => ({
    competition: one(competitions, {
        fields: [gradeWeights.competitionId],
        references: [competitions.id],
    }),
}));

export type Competition = typeof competitions.$inferSelect;
export type NewCompetition = typeof competitions.$inferInsert;
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type Club = typeof clubs.$inferSelect;
export type NewClub = typeof clubs.$inferInsert;
export type ClubAlias = typeof clubAliases.$inferSelect;
export type NewClubAlias = typeof clubAliases.$inferInsert;
export type Grade = typeof grades.$inferSelect;
export type NewGrade = typeof grades.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamSeasonResult = typeof teamSeasonResults.$inferSelect;
export type NewTeamSeasonResult = typeof teamSeasonResults.$inferInsert;
export type GradeWeight = typeof gradeWeights.$inferSelect;
export type NewGradeWeight = typeof gradeWeights.$inferInsert;
