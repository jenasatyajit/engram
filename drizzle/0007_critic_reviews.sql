CREATE TABLE `ai_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`review_id` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`node_ids` text NOT NULL,
	`argument` text,
	`fingerprint` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_node_id` text,
	`result_connection_id` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`review_id`) REFERENCES `ai_reviews`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ai_findings_board_status_idx` ON `ai_findings` (`board_id`,`status`);--> statement-breakpoint
CREATE INDEX `ai_findings_board_fingerprint_idx` ON `ai_findings` (`board_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `ai_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`focus_node_id` text,
	`status` text NOT NULL,
	`error_code` text,
	`model_calls` integer DEFAULT 0 NOT NULL,
	`searches` integer DEFAULT 0 NOT NULL,
	`finding_count` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ai_reviews_board_created_idx` ON `ai_reviews` (`board_id`,`created_at`);