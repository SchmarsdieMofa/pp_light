import { byPath } from "@/server/db/order";
import { and, asc, desc, eq, exists, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { projectAccess, projects, tasks } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { escapeLike } from "@/server/tasks/queries";

export type SearchResult = {
  tasks: { id: string; projectId: string; key: string; path: string; title: string; projectName: string }[];
  projects: { id: string; key: string; name: string }[];
};

/** Must match the expression of the GIN index `tasks_search_idx`. */
const taskDocument = sql`to_tsvector('german', ${tasks.title} || ' ' || ${tasks.description})`;

function visibleProject(db: DB, actor: Actor, projectId: typeof projects.id | typeof tasks.projectId): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(projectAccess)
      .where(and(eq(projectAccess.projectId, projectId), eq(projectAccess.userId, actor.id))),
  );
}

/** "WEB-12" → key WEB, path "12"; "WEB-1.2" → path "1.2"; "12" → path "12". */
function parseNumber(q: string): { key?: string; path: string } | undefined {
  const match = /^(?:([a-z][a-z0-9]{0,9})-)?(\d{1,9}(?:\.\d{1,9}){0,5})$/i.exec(q);
  return match ? { key: match[1]?.toUpperCase(), path: match[2] } : undefined;
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
        path: tasks.path,
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
            ref ? and(eq(tasks.path, ref.path), ref.key ? eq(projects.key, ref.key) : undefined) : undefined,
          ),
        ),
      )
      .orderBy(desc(sql`ts_rank(${taskDocument}, ${query})`), asc(projects.key), asc(byPath(tasks.path)))
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
  return { tasks: taskRows, projects: projectRows.slice(0, 20 - taskRows.length) };
}
