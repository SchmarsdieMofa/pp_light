CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"https_only" boolean DEFAULT false NOT NULL,
	"base_url" text,
	"setup_code_hash" text,
	CONSTRAINT "app_settings_single_row" CHECK ("app_settings"."id" = 1)
);
