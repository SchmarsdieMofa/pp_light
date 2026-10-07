CREATE TABLE "folder_groups" (
	"folder_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"role" "project_role" NOT NULL,
	CONSTRAINT "folder_groups_folder_id_group_id_pk" PRIMARY KEY("folder_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "folder_members" (
	"folder_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "project_role" NOT NULL,
	CONSTRAINT "folder_members_folder_id_user_id_pk" PRIMARY KEY("folder_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "project_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "folder_groups" ADD CONSTRAINT "folder_groups_folder_id_project_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."project_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_groups" ADD CONSTRAINT "folder_groups_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_members" ADD CONSTRAINT "folder_members_folder_id_project_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."project_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_members" ADD CONSTRAINT "folder_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_folders" ADD CONSTRAINT "project_folders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folder_groups_group_idx" ON "folder_groups" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "folder_members_user_idx" ON "folder_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_folder_id_project_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."project_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_folder_idx" ON "projects" USING btree ("folder_id");--> statement-breakpoint
CREATE VIEW "folder_access" AS
SELECT folder_id, user_id, min(role) AS role
FROM (
	SELECT folder_id, user_id, role FROM folder_members
	UNION ALL
	SELECT fg.folder_id, gm.user_id, fg.role
	FROM folder_groups fg JOIN user_group_members gm ON gm.group_id = fg.group_id
) access
GROUP BY folder_id, user_id;--> statement-breakpoint
CREATE OR REPLACE VIEW "project_access" AS
SELECT project_id, user_id, min(role) AS role
FROM (
	SELECT project_id, user_id, role FROM project_members
	UNION ALL
	SELECT pg.project_id, gm.user_id, pg.role
	FROM project_groups pg JOIN user_group_members gm ON gm.group_id = pg.group_id
	UNION ALL
	SELECT p.id AS project_id, fa.user_id, fa.role
	FROM projects p JOIN folder_access fa ON fa.folder_id = p.folder_id
) access
GROUP BY project_id, user_id;
