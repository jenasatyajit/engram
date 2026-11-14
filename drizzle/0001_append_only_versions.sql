-- Version history is append-only (SPEC.md section 9, D15).
-- Edits add a new row; existing versions can never be changed or removed.
CREATE TRIGGER `node_versions_no_update`
BEFORE UPDATE ON `node_versions`
BEGIN
	SELECT RAISE(ABORT, 'node_versions is append-only: add a new version instead of updating');
END;
--> statement-breakpoint
CREATE TRIGGER `node_versions_no_delete`
BEFORE DELETE ON `node_versions`
BEGIN
	SELECT RAISE(ABORT, 'node_versions is append-only: versions cannot be deleted');
END;
--> statement-breakpoint
-- Nothing is hard-deleted: deleting means setting deleted_at.
CREATE TRIGGER `nodes_no_delete`
BEFORE DELETE ON `nodes`
BEGIN
	SELECT RAISE(ABORT, 'nodes are soft-deleted: set deleted_at instead');
END;
--> statement-breakpoint
CREATE TRIGGER `connections_no_delete`
BEFORE DELETE ON `connections`
BEGIN
	SELECT RAISE(ABORT, 'connections are soft-deleted: set deleted_at instead');
END;
