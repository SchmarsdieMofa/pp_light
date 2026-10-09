import type { GlobalRole, ProjectRole } from "@/lib/enums";
import { DomainError } from "@/server/errors";

export type Actor = { id: string; role: GlobalRole; name: string; email: string };

const PROJECT_MATRIX = {
  "project.view": ["owner", "member", "guest"],
  "project.update": ["owner"],
  "project.manageMembers": ["owner"],
  "task.create": ["owner", "member"],
  "task.update": ["owner", "member"],
  "task.delete": ["owner", "member"],
  "comment.create": ["owner", "member", "guest"],
  "comment.editOwn": ["owner", "member", "guest"],
  /** Ask, answer, resolve and reopen questions: everyone with access to the project. */
  "question.ask": ["owner", "member", "guest"],
  "attachment.upload": ["owner", "member"],
} as const satisfies Record<string, readonly ProjectRole[]>;

type ProjectAction = keyof typeof PROJECT_MATRIX;
/**
 * Global actions. `system.manage`: admins only (backups, server settings, assigning roles).
 * `users.manage`: admins and managers (invite, activate/deactivate – see `canManageUser` for whom).
 * `groups.manage`: admins and managers.
 */
export type Action = "system.manage" | "users.manage" | "groups.manage" | "project.create" | ProjectAction;

export const ALL_ACTIONS: readonly Action[] = [
  "system.manage",
  "users.manage",
  "groups.manage",
  "project.create",
  ...(Object.keys(PROJECT_MATRIX) as ProjectAction[]),
];

/** `readOnly`: the project is archived – it can be viewed, but nobody (not even an admin) may change it. */
export type PermissionContext = { projectRole?: ProjectRole | null; isAuthor?: boolean; readOnly?: boolean };

/** The actor's standing in a project: a membership role or "readonly" (archived project). Being a global admin grants no project access. */
export type AccessRole = ProjectRole | "readonly";

export function can(actor: Actor, action: Action, ctx: PermissionContext = {}): boolean {
  if (ctx.readOnly) return action === "project.view";
  if (action === "system.manage") return actor.role === "admin";
  if (action === "users.manage" || action === "groups.manage") return actor.role === "admin" || actor.role === "manager";
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

/** Permission context for a role as returned by getProjectForUser / loadTaskAccess. */
export function projectCtx(role: AccessRole | null): PermissionContext {
  if (role === "readonly") return { projectRole: null, readOnly: true };
  return { projectRole: role };
}

/**
 * Whom a user manager may act on. Admins: everyone. Managers: only plain members – never admins or
 * other managers, so a manager cannot lock out or take over a more privileged account.
 */
export function canManageUser(actor: Actor, targetRole: GlobalRole): boolean {
  if (actor.role === "admin") return true;
  return actor.role === "manager" && targetRole === "member";
}

/** Which global role the actor may hand out (invitations): admins any, managers only "member". */
export function canAssignRole(actor: Actor, role: GlobalRole): boolean {
  if (actor.role === "admin") return true;
  return actor.role === "manager" && role === "member";
}
