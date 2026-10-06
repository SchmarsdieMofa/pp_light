import { describe, expect, it } from "vitest";
import type { GlobalRole, ProjectRole } from "@/lib/enums";
import { ALL_ACTIONS, assertCan, can, canAssignRole, canManageUser, type Action, type Actor } from "@/server/permissions";

const member: Actor = { id: "u1", role: "member", name: "Mia", email: "mia@example.com" };
const admin: Actor = { id: "a1", role: "admin", name: "Ada", email: "ada@example.com" };

const manager: Actor = { id: "m1", role: "manager", name: "Max", email: "max@example.com" };
const PROJECT_ACTIONS = ALL_ACTIONS.filter((action) => !["system.manage", "users.manage", "groups.manage", "project.create"].includes(action));

describe("can", () => {
  // Global actions per global role – the whole table, so a new action or role cannot slip through unnoticed.
  it.each<[string, Actor, Action, boolean]>([
    ["admin", admin, "system.manage", true],
    ["admin", admin, "users.manage", true],
    ["admin", admin, "groups.manage", true],
    ["admin", admin, "project.create", true],
    ["manager", manager, "system.manage", false],
    ["manager", manager, "users.manage", true],
    ["manager", manager, "groups.manage", true],
    ["manager", manager, "project.create", true],
    ["member", member, "system.manage", false],
    ["member", member, "users.manage", false],
    ["member", member, "groups.manage", false],
    ["member", member, "project.create", true],
  ])("%s · %s = %s", (_role, actor, action, expected) => {
    expect(can(actor, action)).toBe(expected);
  });

  it("covers every action in the table above", () => {
    expect(ALL_ACTIONS.filter((action) => !PROJECT_ACTIONS.includes(action)).sort()).toEqual(
      ["groups.manage", "project.create", "system.manage", "users.manage"],
    );
  });

  it.each([admin, manager, member])("gives $role no project rights without membership, even in an archived project", (actor) => {
    for (const action of PROJECT_ACTIONS) {
      expect(can(actor, action)).toBe(false);
      expect(can(actor, action, { projectRole: null })).toBe(false);
    }
    expect(can(actor, "project.view", { readOnly: true })).toBe(true);
    expect(can(actor, "task.update", { readOnly: true })).toBe(false);
  });

  it.each([admin, manager])("limits $role who is a project member to the membership role", (actor) => {
    expect(can(actor, "task.update", { projectRole: "member" })).toBe(true);
    expect(can(actor, "project.update", { projectRole: "member" })).toBe(false);
    expect(can(actor, "project.manageMembers", { projectRole: "guest" })).toBe(false);
    expect(can(actor, "project.update", { projectRole: "owner" })).toBe(true);
  });

  it.each<[Actor, GlobalRole, boolean]>([
    [admin, "admin", true], [admin, "manager", true], [admin, "member", true],
    [manager, "admin", false], [manager, "manager", false], [manager, "member", true],
    [member, "admin", false], [member, "manager", false], [member, "member", false],
  ])("canManageUser: %#", (actor, target, expected) => {
    expect(canManageUser(actor, target)).toBe(expected);
    expect(canAssignRole(actor, target)).toBe(expected);
  });

  it("lets every user create projects", () => {
    expect(can(member, "project.create")).toBe(true);
  });

  it("denies project actions without membership", () => {
    expect(can(member, "project.view")).toBe(false);
    expect(can(member, "project.view", { projectRole: null })).toBe(false);
  });

  it.each<[ProjectRole, Action, boolean]>([
    ["owner", "project.update", true],
    ["member", "project.update", false],
    ["guest", "project.update", false],
    ["owner", "project.manageMembers", true],
    ["member", "project.manageMembers", false],
    ["owner", "task.create", true],
    ["member", "task.create", true],
    ["guest", "task.create", false],
    ["member", "task.update", true],
    ["guest", "task.update", false],
    ["guest", "project.view", true],
    ["guest", "comment.create", true],
    ["member", "attachment.upload", true],
    ["guest", "attachment.upload", false],
  ])("%s → %s = %s", (projectRole, action, expected) => {
    expect(can(member, action, { projectRole })).toBe(expected);
  });

  it("lets project members edit only their own comments", () => {
    expect(can(member, "comment.editOwn", { projectRole: "guest", isAuthor: true })).toBe(true);
    expect(can(member, "comment.editOwn", { projectRole: "owner", isAuthor: false })).toBe(false);
  });
});

describe("assertCan", () => {
  it("throws FORBIDDEN when not allowed", () => {
    expect(() => assertCan(member, "system.manage")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("passes silently when allowed", () => {
    expect(() => assertCan(member, "project.create")).not.toThrow();
  });
});
