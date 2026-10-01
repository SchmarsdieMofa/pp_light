import type { GlobalRole, ProjectRole } from "@/lib/enums";
import { DomainError } from "@/server/errors";

export type Actor = { id: string; role: GlobalRole; name: string; email: string };

const PROJECT_MATRIX = {
  "project.view": ["owner", "member", "guest"],
  "project.update": ["owner"],
  "project.manageMembers": ["owner"],
  "task.create": ["owner", "member"],
  "task.update": ["owner", "member"],
  "comment.create": ["owner", "member", "guest"],
  "comment.editOwn": ["owner", "member", "guest"],
  "attachment.upload": ["owner", "member"],
} as const satisfies Record<string, readonly ProjectRole[]>;

type ProjectAction = keyof typeof PROJECT_MATRIX;
export type Action = "admin.manageUsers" | "project.create" | ProjectAction;

export const ALL_ACTIONS: readonly Action[] = [
  "admin.manageUsers",
  "project.create",
  ...(Object.keys(PROJECT_MATRIX) as ProjectAction[]),
];

export type PermissionContext = { projectRole?: ProjectRole | null; isAuthor?: boolean };

export function can(actor: Actor, action: Action, ctx: PermissionContext = {}): boolean {
  if (actor.role === "admin") return true;
  if (action === "admin.manageUsers") return false;
  if (action === "project.create") return true;

  const role = ctx.projectRole;
  if (!role) return false;
  if (!(PROJECT_MATRIX[action] as readonly ProjectRole[]).includes(role)) return false;
  if (action === "comment.editOwn") return ctx.isAuthor === true;
  return true;
}

export function assertCan(actor: Actor, action: Action, ctx: PermissionContext = {}): void {
  if (!can(actor, action, ctx)) {
    throw new DomainError("FORBIDDEN", "Dafür fehlt die Berechtigung.");
  }
}
