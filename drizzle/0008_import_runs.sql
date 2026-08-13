CREATE TABLE `import_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`years_json` text,
	`games` integer NOT NULL,
	`seasons` integer,
	`grades` integer,
	`teams` integer,
	`results` integer,
	`games_count` integer,
	`warnings_json` text,
	`error_text` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_runs_instance_id_unique` ON `import_runs` (`instance_id`);