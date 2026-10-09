ALTER TABLE "notification_preferences" ALTER COLUMN "disabled_email_types" SET DEFAULT '["assigned","status"]'::jsonb;
--> statement-breakpoint
UPDATE "notification_preferences" SET "disabled_email_types" = '["assigned","status"]'::jsonb WHERE "disabled_email_types" = '[]'::jsonb;
