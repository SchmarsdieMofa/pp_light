ALTER TABLE "tasks" ADD COLUMN "subtask_counter" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "tasks" t SET "subtask_counter" = COALESCE((SELECT max(c."number") FROM "tasks" c WHERE c."parent_id" = t."id"), 0);
