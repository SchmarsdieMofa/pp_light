CREATE TABLE "project_groups" (
	"project_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"role" "project_role" NOT NULL,
	CONSTRAINT "project_groups_project_id_group_id_pk" PRIMARY KEY("project_id","group_id")
);
--> statement-breakpoint
ALTER TABLE "project_groups" ADD CONSTRAINT "project_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_groups" ADD CONSTRAINT "project_groups_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_groups_group_idx" ON "project_groups" USING btree ("group_id");--> statement-breakpoint
CREATE VIEW "project_access" AS
SELECT project_id, user_id, min(role) AS role
FROM (
	SELECT project_id, user_id, role FROM project_members
	UNION ALL
	SELECT pg.project_id, gm.user_id, pg.role
	FROM project_groups pg JOIN user_group_members gm ON gm.group_id = pg.group_id
) access
GROUP BY project_id, user_id;
