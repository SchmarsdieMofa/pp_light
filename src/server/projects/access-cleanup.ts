import { sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";

/**
 * Drops task assignments of people who no longer have access to the task's project – after a member, a
 * group member or a whole group left. Without `projectIds` every project is checked.
 */
export async function pruneAssignees(ex: Executor, projectIds?: string[]): Promise<void> {
  if (projectIds && projectIds.length === 0) return;
  const scope = projectIds ? sql`and t.project_id in (${sql.join(projectIds.map((id) => sql`${id}`), sql`, `)})` : sql``;
  await ex.execute(sql`
    delete from task_assignees ta using tasks t
    where ta.task_id = t.id ${scope}
      and not exists (select 1 from project_access pa where pa.project_id = t.project_id and pa.user_id = ta.user_id)
  `);
}
