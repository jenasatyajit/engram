CREATE TABLE `deletion_events` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deletion_events_entity_idx` ON `deletion_events` (`entity_type`,`entity_id`,`created_at`);