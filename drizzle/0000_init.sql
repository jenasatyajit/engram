CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `boards_updated_at_idx` ON `boards` (`updated_at`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`from_node_id` text NOT NULL,
	`to_node_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_by` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `connections_board_idx` ON `connections` (`board_id`);--> statement-breakpoint
CREATE INDEX `connections_from_idx` ON `connections` (`from_node_id`);--> statement-breakpoint
CREATE INDEX `connections_to_idx` ON `connections` (`to_node_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `connections_one_parent_idx` ON `connections` (`to_node_id`) WHERE "connections"."kind" = 'child' AND "connections"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `node_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`text` text NOT NULL,
	`note` text,
	`author` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `node_versions_node_created_idx` ON `node_versions` (`node_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`type` text,
	`created_by` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `nodes_board_idx` ON `nodes` (`board_id`);