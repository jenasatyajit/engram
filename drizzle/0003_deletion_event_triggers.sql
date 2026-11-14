-- Delete/restore history for timeline replay (SPEC.md section 9, D15).
-- Every change of deleted_at on boards, nodes and connections is logged
-- automatically in deletion_events, which is itself append-only.
-- "deleted" events use the deleted_at value the app wrote; "restored" events use the current time.

-- deletion_events is append-only.
CREATE TRIGGER `deletion_events_no_update`
BEFORE UPDATE ON `deletion_events`
BEGIN
	SELECT RAISE(ABORT, 'deletion_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `deletion_events_no_delete`
BEFORE DELETE ON `deletion_events`
BEGIN
	SELECT RAISE(ABORT, 'deletion_events is append-only');
END;
--> statement-breakpoint

-- Boards are soft-deleted too.
CREATE TRIGGER `boards_no_delete`
BEFORE DELETE ON `boards`
BEGIN
	SELECT RAISE(ABORT, 'boards are soft-deleted: set deleted_at instead');
END;
--> statement-breakpoint

-- Boards
CREATE TRIGGER `boards_no_redelete`
BEFORE UPDATE OF `deleted_at` ON `boards`
WHEN OLD.`deleted_at` IS NOT NULL AND NEW.`deleted_at` IS NOT NULL AND OLD.`deleted_at` != NEW.`deleted_at`
BEGIN
	SELECT RAISE(ABORT, 'board is already deleted: restore it first');
END;
--> statement-breakpoint
CREATE TRIGGER `boards_log_deletion`
AFTER UPDATE OF `deleted_at` ON `boards`
WHEN OLD.`deleted_at` IS NOT NEW.`deleted_at`
BEGIN
	INSERT INTO `deletion_events` (`id`, `entity_type`, `entity_id`, `action`, `created_at`)
	VALUES (
		lower(hex(randomblob(16))),
		'board',
		NEW.`id`,
		CASE WHEN NEW.`deleted_at` IS NULL THEN 'restored' ELSE 'deleted' END,
		COALESCE(NEW.`deleted_at`, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
	);
END;
--> statement-breakpoint

-- Nodes
CREATE TRIGGER `nodes_no_redelete`
BEFORE UPDATE OF `deleted_at` ON `nodes`
WHEN OLD.`deleted_at` IS NOT NULL AND NEW.`deleted_at` IS NOT NULL AND OLD.`deleted_at` != NEW.`deleted_at`
BEGIN
	SELECT RAISE(ABORT, 'node is already deleted: restore it first');
END;
--> statement-breakpoint
CREATE TRIGGER `nodes_log_deletion`
AFTER UPDATE OF `deleted_at` ON `nodes`
WHEN OLD.`deleted_at` IS NOT NEW.`deleted_at`
BEGIN
	INSERT INTO `deletion_events` (`id`, `entity_type`, `entity_id`, `action`, `created_at`)
	VALUES (
		lower(hex(randomblob(16))),
		'node',
		NEW.`id`,
		CASE WHEN NEW.`deleted_at` IS NULL THEN 'restored' ELSE 'deleted' END,
		COALESCE(NEW.`deleted_at`, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
	);
END;
--> statement-breakpoint

-- Connections
CREATE TRIGGER `connections_no_redelete`
BEFORE UPDATE OF `deleted_at` ON `connections`
WHEN OLD.`deleted_at` IS NOT NULL AND NEW.`deleted_at` IS NOT NULL AND OLD.`deleted_at` != NEW.`deleted_at`
BEGIN
	SELECT RAISE(ABORT, 'connection is already deleted: restore it first');
END;
--> statement-breakpoint
CREATE TRIGGER `connections_log_deletion`
AFTER UPDATE OF `deleted_at` ON `connections`
WHEN OLD.`deleted_at` IS NOT NEW.`deleted_at`
BEGIN
	INSERT INTO `deletion_events` (`id`, `entity_type`, `entity_id`, `action`, `created_at`)
	VALUES (
		lower(hex(randomblob(16))),
		'connection',
		NEW.`id`,
		CASE WHEN NEW.`deleted_at` IS NULL THEN 'restored' ELSE 'deleted' END,
		COALESCE(NEW.`deleted_at`, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
	);
END;
