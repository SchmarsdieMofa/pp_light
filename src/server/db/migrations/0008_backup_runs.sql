CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" uuid,
	"name" text,
	"size_bytes" bigint,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "backup_runs_trigger_check" CHECK ("backup_runs"."trigger" in ('manual', 'scheduled')),
	CONSTRAINT "backup_runs_status_check" CHECK ("backup_runs"."status" in ('pending', 'running', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backup_runs_created_idx" ON "backup_runs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "backup_runs_active_idx" ON "backup_runs" USING btree ("status") WHERE "backup_runs"."status" in ('pending', 'running');