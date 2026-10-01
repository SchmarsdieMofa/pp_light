import { describe, expect, it } from "vitest";
import type { ProjectRole } from "@/lib/enums";
import { ALL_ACTIONS, assertCan, can, type Action, type Actor } from "@/server/permissions";

const member: Actor = { id: "u1", role: "member", name: "Mia", email: "mia@example.com" };
const admin: Actor = { id: "a1", role: "admin", name: "Ada", email: "ada@example.com" };

describe("can", () => {
  it("lets admins do everything, even without project membership", () => {
    for (const action of ALL_ACTIONS) expect(can(admin, action)).toBe(true);
  });

  it("lets only admins manage users", () => {
    expect(can(member, "admin.manageUsers")).toBe(false);
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
    expect(() => assertCan(member, "admin.manageUsers")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("passes silently when allowed", () => {
    expect(() => assertCan(member, "project.create")).not.toThrow();
  });
});
