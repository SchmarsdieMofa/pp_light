CREATE TABLE "phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"is_milestone" boolean DEFAULT false NOT NULL,
	"position" text NOT NULL,
	CONSTRAINT "phases_dates_ck" CHECK ("phases"."start_date" is null or "phases"."end_date" is null or "phases"."start_date" <= "phases"."end_date"),
	CONSTRAINT "phases_milestone_ck" CHECK (not "phases"."is_milestone" or ("phases"."start_date" is not null and "phases"."start_date" = "phases"."end_date"))
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"lag_days" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "task_dependencies_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "task_dependencies_distinct_ck" CHECK ("task_dependencies"."blocker_id" <> "task_dependencies"."blocked_id"),
	CONSTRAINT "task_dependencies_lag_ck" CHECK ("task_dependencies"."lag_days" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "phase_id" uuid;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blocker_id_tasks_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blocked_id_tasks_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "phases_project_name_uq" ON "phases" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE INDEX "phases_project_idx" ON "phases" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_blocked_idx" ON "task_dependencies" USING btree ("blocked_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_phase_idx" ON "tasks" USING btree ("phase_id");