import { and, asc, desc, eq, exists, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { projectMembers, projects, tasks } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { escapeLike } from "@/server/tasks/queries";

export type SearchResult = {
  tasks: { id: string; projectId: string; key: string; number: number; title: string; projectName: string }[];
  projects: { id: string; key: string; name: string }[];
};

/** Must match the expression of the GIN index `tasks_search_idx`. */
const taskDocument = sql`to_tsvector('german', ${tasks.title} || ' ' || ${tasks.description})`;

function visibleProject(db: DB, actor: Actor, projectId: typeof projects.id | typeof tasks.projectId): SQL {
  if (actor.role === "admin") return sql`true`;
  return exists(
    db
      .select({ one: sql`1` })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actor.id))),
  );
}

/** "WEB-12" → key WEB, number 12; "12" → number 12. */
function parseNumber(q: string): { key?: string; number: number } | undefined {
  const match = /^(?:([a-z][a-z0-9]{0,9})-)?(\d{1,9})$/i.exec(q);
  return match ? { key: match[1]?.toUpperCase(), number: Number(match[2]) } : undefined;
}

export async function searchEverything(db: DB, actor: Actor, rawQuery: string): Promise<SearchResult> {
  const q = rawQuery.trim().slice(0, 100);
  if (!q) return { tasks: [], projects: [] };
  const like = `%${escapeLike(q)}%`;
  // websearch_to_tsquery accepts any user text without syntax errors (quotes, &, |, :* …).
  const query = sql`websearch_to_tsquery('german', ${q})`;
  const ref = parseNumber(q);

  const [taskRows, projectRows] = await Promise.all([
    db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        key: projects.key,
        number: tasks.number,
        title: tasks.title,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          isNull(projects.archivedAt),
          visibleProject(db, actor, tasks.projectId),
          or(
            sql`${taskDocument} @@ ${query}`,
            ilike(tasks.title, like),
            ref ? and(eq(tasks.number, ref.number), ref.key ? eq(projects.key, ref.key) : undefined) : undefined,
          ),
        ),
      )
      .orderBy(desc(sql`ts_rank(${taskDocument}, ${query})`), asc(projects.key), asc(tasks.number))
      .limit(20),
    db
      .select({ id: projects.id, key: projects.key, name: projects.name })
      .from(projects)
      .where(
        and(isNull(projects.archivedAt), visibleProject(db, actor, projects.id), or(ilike(projects.name, like), ilike(projects.key, like))),
      )
      .orderBy(asc(projects.name))
      .limit(5),
  ]);
  return { tasks: taskRows, projects: projectRows };
}
