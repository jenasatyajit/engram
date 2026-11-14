CREATE TABLE `ai_usage` (
	`day` text PRIMARY KEY NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `nodes` ADD `title` text;--> statement-breakpoint
ALTER TABLE `nodes` ADD `title_source` text;--> statement-breakpoint
ALTER TABLE `nodes` ADD `titled_version_id` text;