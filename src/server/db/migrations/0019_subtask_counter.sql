ALTER TABLE "tasks" ADD COLUMN "subtask_counter" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "tasks" t SET "subtask_counter" = c."highest" FROM (SELECT "parent_id", max("number") AS "highest" FROM "tasks" WHERE "parent_id" IS NOT NULL GROUP BY "parent_id") c WHERE t."id" = c."parent_id";
