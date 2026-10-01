import type { ProjectRole } from "@/lib/enums";
import { projectMembers } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { createProject, listStatuses } from "@/server/projects/service";
import { createUser } from "@/server/users/service";
import { testDb } from "./db";

export async function makeActor(email: string, role: "admin" | "member" = "member"): Promise<Actor> {
  const u = await createUser(testDb, { email, name: email.split("@")[0], role });
  return { id: u.id, role: u.role, name: u.name, email: u.email };
}

export async function makeProject(owner: Actor, key: string) {
  const project = await createProject(testDb, owner, { name: `Projekt ${key}`, key });
  const statuses = await listStatuses(testDb, project.id);
  return { project, statuses, open: statuses[0], done: statuses.find((s) => s.isDone)! };
}

export async function addMember(projectId: string, actor: Actor, role: ProjectRole) {
  await testDb.insert(projectMembers).values({ projectId, userId: actor.id, role });
}
