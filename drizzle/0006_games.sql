CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grade_id` integer NOT NULL,
	`playhq_id` text NOT NULL,
	`round` integer,
	`round_name` text,
	`played_at` integer,
	`home_team_id` integer,
	`away_team_id` integer,
	`home_score` integer,
	`away_score` integer,
	`status` text NOT NULL,
	`forfeiting_side` text,
	`source` text NOT NULL,
	`scraped_at` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`grade_id`) REFERENCES `grades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_grade_playhq_idx` ON `games` (`grade_id`,`playhq_id`);--> statement-breakpoint
CREATE INDEX `games_grade_idx` ON `games` (`grade_id`);--> statement-breakpoint
CREATE INDEX `games_home_team_idx` ON `games` (`home_team_id`);--> statement-breakpoint
CREATE INDEX `games_away_team_idx` ON `games` (`away_team_id`);
--> statement-breakpoint
-- The generator also re-emitted a drop/create of `teams_grade_playhq_idx`.
-- `0003_team_identity.sql` already applied that by hand (with IF EXISTS /
-- IF NOT EXISTS) without updating drizzle's snapshot, so re-running it here
-- would fail on an index that already exists. Removed deliberately; the 0006
-- snapshot now records the real shape, so it will not be emitted again.