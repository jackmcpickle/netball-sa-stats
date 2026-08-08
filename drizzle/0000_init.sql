CREATE TABLE `club_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`club_id` integer NOT NULL,
	`alias_text` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `club_aliases_alias_text_unique` ON `club_aliases` (`alias_text`);--> statement-breakpoint
CREATE TABLE `clubs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`club_key` text NOT NULL,
	`name` text NOT NULL,
	`established_year` integer,
	`home_venue` text,
	`playhq_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clubs_club_key_unique` ON `clubs` (`club_key`);--> statement-breakpoint
CREATE TABLE `competitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`playhq_org_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competitions_key_unique` ON `competitions` (`key`);--> statement-breakpoint
CREATE TABLE `grade_weights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`competition_id` integer NOT NULL,
	`tier` integer NOT NULL,
	`division` integer,
	`label` text NOT NULL,
	`weight` real NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grade_weights_competition_tier_division_idx` ON `grade_weights` (`competition_id`,`tier`,`division`);--> statement-breakpoint
CREATE TABLE `grades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`grade_key` text NOT NULL,
	`name` text NOT NULL,
	`tier` integer NOT NULL,
	`division` integer,
	`team_count` integer NOT NULL,
	`age_band` text,
	`playhq_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grades_grade_key_unique` ON `grades` (`grade_key`);--> statement-breakpoint
CREATE INDEX `grades_season_idx` ON `grades` (`season_id`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`competition_id` integer NOT NULL,
	`season_key` text NOT NULL,
	`competition_period` text NOT NULL,
	`label` text NOT NULL,
	`start_year` integer NOT NULL,
	`end_year` integer NOT NULL,
	`is_final` integer DEFAULT false NOT NULL,
	`playhq_id` text,
	`source` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_season_key_unique` ON `seasons` (`season_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_competition_period_year_idx` ON `seasons` (`competition_id`,`competition_period`,`start_year`);--> statement-breakpoint
CREATE TABLE `team_season_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`grade_id` integer NOT NULL,
	`ladder_position` integer NOT NULL,
	`position_uncertain` integer DEFAULT false NOT NULL,
	`played` integer,
	`won` integer,
	`drawn` integer,
	`lost` integer,
	`byes` integer,
	`goals_for` integer,
	`goals_against` integer,
	`goal_difference` integer,
	`points` integer,
	`percentage` real,
	`shots_attempted` integer,
	`shots_scored` integer,
	`source` text NOT NULL,
	`placement_basis` text NOT NULL,
	`notes` text,
	`scraped_at` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grade_id`) REFERENCES `grades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_season_results_team_grade_idx` ON `team_season_results` (`team_id`,`grade_id`);--> statement-breakpoint
CREATE INDEX `team_season_results_grade_idx` ON `team_season_results` (`grade_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`club_id` integer NOT NULL,
	`grade_id` integer NOT NULL,
	`display_name` text NOT NULL,
	`squad_number` integer,
	`playhq_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grade_id`) REFERENCES `grades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_grade_club_squad_idx` ON `teams` (`grade_id`,`club_id`,`squad_number`);--> statement-breakpoint
CREATE INDEX `teams_club_idx` ON `teams` (`club_id`);