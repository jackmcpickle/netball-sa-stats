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
    createdAt: text('created_at')
        .notNull()
        .default(sql`(current_timestamp)`),
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    playhqOrgId: text('playhq_org_id'),
});

export const seasons = sqliteTable(
    'seasons',
    {
        competitionId: integer('competition_id')
            .notNull()
            .references(() => competitions.id, { onDelete: 'cascade' }),
        competitionPeriod: text('competition_period')
            .notNull()
            .$type<CompetitionPeriod>(),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(current_timestamp)`),
        /** Same as startYear for winter/annual; +1 for summer. */
        endYear: integer('end_year').notNull(),
        id: integer('id').primaryKey({ autoIncrement: true }),
        /**
         * Curated by hand in the season CSV, never inferred — a scraper cannot tell
         * a round-18 ladder from a round-22 one. In-progress seasons are excluded
         * from championship rankings.
         */
        isFinal: integer('is_final', { mode: 'boolean' })
            .notNull()
            .default(false),
        label: text('label').notNull(),
        playhqId: text('playhq_id'),
        seasonKey: text('season_key').notNull().unique(),
        source: text('source').notNull().$type<Source>(),
        startYear: integer('start_year').notNull(),
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
    clubKey: text('club_key').notNull().unique(),
    createdAt: text('created_at')
        .notNull()
        .default(sql`(current_timestamp)`),
    establishedYear: integer('established_year'),
    homeVenue: text('home_venue'),
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    playhqId: text('playhq_id'),
});

/**
 * Maps source spellings onto clubs — `C/Coasters` → City Coasters, `West/Jets` →
 * Western Jets. Import fails loudly on an unknown name rather than inventing a club:
 * once a bad run has written rows against a phantom club, untangling it is manual.
 */
export const clubAliases = sqliteTable('club_aliases', {
    aliasText: text('alias_text').notNull().unique(),
    clubId: integer('club_id')
        .notNull()
        .references(() => clubs.id, { onDelete: 'cascade' }),
    createdAt: text('created_at')
        .notNull()
        .default(sql`(current_timestamp)`),
    id: integer('id').primaryKey({ autoIncrement: true }),
    source: text('source').notNull(),
});

export const grades = sqliteTable(
    'grades',
    {
        ageBand: text('age_band'),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(current_timestamp)`),
        /** Rank within the band, parsed from the name (B.3 → 3). */
        division: integer('division'),
        gradeKey: text('grade_key').notNull().unique(),
        id: integer('id').primaryKey({ autoIncrement: true }),
        name: text('name').notNull(),
        playhqId: text('playhq_id'),
        seasonId: integer('season_id')
            .notNull()
            .references(() => seasons.id, { onDelete: 'cascade' }),
        /**
         * Ladder row count. Free at scrape time and unrecoverable later without
         * re-scraping — position 4 of 6 is not position 4 of 14.
         */
        teamCount: integer('team_count').notNull(),
        /** Seniority band, ordered. 1 = Premier Division. */
        tier: integer('tier').notNull(),
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
        clubId: integer('club_id')
            .notNull()
            .references(() => clubs.id, { onDelete: 'cascade' }),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(current_timestamp)`),
        displayName: text('display_name').notNull(),
        gradeId: integer('grade_id')
            .notNull()
            .references(() => grades.id, { onDelete: 'cascade' }),
        id: integer('id').primaryKey({ autoIncrement: true }),
        playhqId: text('playhq_id'),
        squadNumber: integer('squad_number'),
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
        byes: integer('byes'),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(current_timestamp)`),
        drawn: integer('drawn'),
        goalDifference: integer('goal_difference'),
        goalsAgainst: integer('goals_against'),
        goalsFor: integer('goals_for'),
        gradeId: integer('grade_id')
            .notNull()
            .references(() => grades.id, { onDelete: 'cascade' }),
        id: integer('id').primaryKey({ autoIncrement: true }),
        ladderPosition: integer('ladder_position').notNull(),
        lost: integer('lost'),
        notes: text('notes'),
        /** Goals for ÷ against × 100. */
        percentage: real('percentage'),
        placementBasis: text('placement_basis')
            .notNull()
            .$type<PlacementBasis>(),
        played: integer('played'),
        points: integer('points'),
        /** Archive-PDF top-4 only; always false for PlayHQ rows. */
        positionUncertain: integer('position_uncertain', { mode: 'boolean' })
            .notNull()
            .default(false),
        scrapedAt: integer('scraped_at'),
        shotsAttempted: integer('shots_attempted'),
        shotsScored: integer('shots_scored'),
        source: text('source').notNull().$type<Source>(),
        teamId: integer('team_id')
            .notNull()
            .references(() => teams.id, { onDelete: 'cascade' }),
        won: integer('won'),
    },
    (t) => [
        uniqueIndex('team_season_results_team_grade_idx').on(
            t.teamId,
            t.gradeId,
        ),
        index('team_season_results_grade_idx').on(t.gradeId),
    ],
);

export const GAME_STATUSES = [
    'final',
    'forfeit',
    'no_result',
    'bye',
    'scheduled',
] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

/**
 * `both` covers PlayHQ's `DOUBLE_FORFEIT`, where neither side turned up and
 * neither is awarded the win. Never observed in sampling (see
 * `docs/playhq-api.md` §6) but it is a real value in their enum, and a
 * backfill run should not die on the first one.
 */
export const FORFEIT_SIDES = ['home', 'away', 'both'] as const;
export type ForfeitSide = (typeof FORFEIT_SIDES)[number];

/**
 * One row per fixture. Hangs off `grades`, not `seasons`: a grade already
 * carries its season, tier and division, so every season/grade/band filter the
 * site already has applies to games through a single join.
 *
 * `status` is stored rather than derived so the "forfeits count as results"
 * decision can be revisited without a re-scrape. Team ids are nullable because
 * a bye has only one side — and note that a bye is *synthesised* at import,
 * since PlayHQ returns byes as a round-level team list rather than as a game.
 *
 * Scores on a `forfeit` row are PlayHQ's fabricated 0–20 scoreline, not goals
 * anyone shot. Goal totals must filter on `status`, not on "both scores
 * present", or every head-to-head differential absorbs phantom 20-goal margins.
 */
export const games = sqliteTable(
    'games',
    {
        awayScore: integer('away_score'),
        awayTeamId: integer('away_team_id').references(() => teams.id, {
            onDelete: 'cascade',
        }),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(current_timestamp)`),
        forfeitingSide: text('forfeiting_side').$type<ForfeitSide>(),
        gradeId: integer('grade_id')
            .notNull()
            .references(() => grades.id, { onDelete: 'cascade' }),
        homeScore: integer('home_score'),
        homeTeamId: integer('home_team_id').references(() => teams.id, {
            onDelete: 'cascade',
        }),
        id: integer('id').primaryKey({ autoIncrement: true }),
        /**
         * Ladders cover the regular season only, so finals must be separable
         * to reconcile games against them — and a final is worth labelling as
         * one rather than showing as "round 15".
         */
        isFinals: integer('is_finals', { mode: 'boolean' })
            .notNull()
            .default(false),
        /** Epoch seconds, null when PlayHQ has no scheduled time. */
        playedAt: integer('played_at'),
        playhqId: text('playhq_id').notNull(),
        round: integer('round'),
        roundName: text('round_name'),
        scrapedAt: integer('scraped_at'),
        source: text('source').notNull().$type<Source>(),
        status: text('status').notNull().$type<GameStatus>(),
    },
    (t) => [
        /** Identity is (grade, playhq id) — the same rule `teams` uses. */
        uniqueIndex('games_grade_playhq_idx').on(t.gradeId, t.playhqId),
        index('games_grade_idx').on(t.gradeId),
        index('games_home_team_idx').on(t.homeTeamId),
        index('games_away_team_idx').on(t.awayTeamId),
    ],
);

/**
 * Championship weighting. Seeded from a formula but editable per row, and applied
 * at query time so a re-weight re-ranks every season without a re-import.
 */
export const IMPORT_RUN_STATUSES = [
    'running',
    'ok',
    'error',
    'skipped',
] as const;
export type ImportRunStatus = (typeof IMPORT_RUN_STATUSES)[number];

export const importRuns = sqliteTable('import_runs', {
    errorText: text('error_text'),
    finishedAt: integer('finished_at'),
    games: integer('games', { mode: 'boolean' }).notNull(),
    gamesCount: integer('games_count'),
    grades: integer('grades'),
    id: integer('id').primaryKey({ autoIncrement: true }),
    instanceId: text('instance_id').notNull().unique(),
    results: integer('results'),
    seasons: integer('seasons'),
    startedAt: integer('started_at').notNull(),
    status: text('status').notNull().$type<ImportRunStatus>(),
    teams: integer('teams'),
    warningsJson: text('warnings_json'),
    yearsJson: text('years_json'),
});

export const gradeWeights = sqliteTable(
    'grade_weights',
    {
        competitionId: integer('competition_id')
            .notNull()
            .references(() => competitions.id, { onDelete: 'cascade' }),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(current_timestamp)`),
        division: integer('division'),
        id: integer('id').primaryKey({ autoIncrement: true }),
        label: text('label').notNull(),
        tier: integer('tier').notNull(),
        weight: real('weight').notNull(),
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
    gradeWeights: many(gradeWeights),
    seasons: many(seasons),
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
    games: many(games),
    results: many(teamSeasonResults),
    season: one(seasons, {
        fields: [grades.seasonId],
        references: [seasons.id],
    }),
    teams: many(teams),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
    club: one(clubs, { fields: [teams.clubId], references: [clubs.id] }),
    grade: one(grades, { fields: [teams.gradeId], references: [grades.id] }),
    results: many(teamSeasonResults),
}));

export const teamSeasonResultsRelations = relations(
    teamSeasonResults,
    ({ one }) => ({
        grade: one(grades, {
            fields: [teamSeasonResults.gradeId],
            references: [grades.id],
        }),
        team: one(teams, {
            fields: [teamSeasonResults.teamId],
            references: [teams.id],
        }),
    }),
);

export const gamesRelations = relations(games, ({ one }) => ({
    awayTeam: one(teams, {
        fields: [games.awayTeamId],
        references: [teams.id],
        relationName: 'awayTeam',
    }),
    grade: one(grades, { fields: [games.gradeId], references: [grades.id] }),
    homeTeam: one(teams, {
        fields: [games.homeTeamId],
        references: [teams.id],
        relationName: 'homeTeam',
    }),
}));

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
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type GradeWeight = typeof gradeWeights.$inferSelect;
export type NewGradeWeight = typeof gradeWeights.$inferInsert;
export type ImportRunRow = typeof importRuns.$inferSelect;
export type NewImportRun = typeof importRuns.$inferInsert;
