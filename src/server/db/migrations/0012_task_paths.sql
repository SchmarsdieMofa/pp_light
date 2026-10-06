DROP INDEX "tasks_project_number_uq";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "path" text;--> statement-breakpoint
-- Top-level tasks are numbered 1, 2, 3 … per project; subtasks get 3.1, 3.2, 3.1.1 … below their parent.
WITH RECURSIVE roots AS (
	SELECT id, (row_number() OVER (PARTITION BY project_id ORDER BY number))::int AS seq
	FROM tasks WHERE parent_id IS NULL
), kids AS (
	SELECT id, parent_id, (row_number() OVER (PARTITION BY parent_id ORDER BY number))::int AS seq
	FROM tasks WHERE parent_id IS NOT NULL
), tree AS (
	SELECT id, seq, seq::text AS path FROM roots
	UNION ALL
	SELECT k.id, k.seq, tree.path || '.' || k.seq FROM kids k JOIN tree ON tree.id = k.parent_id
)
UPDATE tasks SET number = tree.seq, path = tree.path FROM tree WHERE tree.id = tasks.id;--> statement-breakpoint
UPDATE projects SET task_counter = (SELECT count(*) FROM tasks WHERE tasks.project_id = projects.id AND tasks.parent_id IS NULL);--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "path" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_project_path_uq" ON "tasks" USING btree ("project_id","path");
