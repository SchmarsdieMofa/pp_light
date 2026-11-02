ALTER TABLE "appointments" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "task_order" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_owner_start_idx" ON "appointments" USING btree ("owner_id","starts_at");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_private_task_ck" CHECK ("appointments"."owner_id" is null or "appointments"."task_id" is not null);