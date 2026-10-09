import { describe, expect, it } from "vitest";
import { isTypingTarget, resolveShortcut } from "@/lib/shortcuts";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});
const project = "/projects/3f2504e0-4f89-41d3-9a0c-0305e82c3301/board";

describe("isTypingTarget", () => {
  it("treats text fields, selects and editable content as typing", () => {
    expect(isTypingTarget({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("resolveShortcut", () => {
  it("opens the palette with Ctrl/Cmd+K even while typing", () => {
    expect(resolveShortcut(key("k", { ctrlKey: true }), true, "/")).toEqual({ kind: "palette" });
    expect(resolveShortcut(key("K", { metaKey: true }), false, "/")).toEqual({ kind: "palette" });
  });

  it("ignores single-key shortcuts while typing or with modifiers", () => {
    expect(resolveShortcut(key("c"), true, project)).toBeNull();
    expect(resolveShortcut(key("1", { ctrlKey: true }), false, project)).toBeNull();
    expect(resolveShortcut(key("Escape"), true, project)).toBeNull();
  });

  it("maps c, ?, Escape and the view keys", () => {
    expect(resolveShortcut(key("c"), false, project)).toEqual({ kind: "newTask" });
    expect(resolveShortcut(key("?"), false, "/")).toEqual({ kind: "help" });
    expect(resolveShortcut(key("Escape"), false, project)).toEqual({ kind: "closePanel" });
    expect(resolveShortcut(key("2"), false, project)).toEqual({
      kind: "view",
      href: "/projects/3f2504e0-4f89-41d3-9a0c-0305e82c3301/gantt",
    });
    expect(resolveShortcut(key("3"), false, project)).toMatchObject({ href: expect.stringMatching(/\/list$/) });
    expect(resolveShortcut(key("4"), false, project)).toEqual({
      kind: "view",
      href: "/projects/3f2504e0-4f89-41d3-9a0c-0305e82c3301/questions",
    });
  });

  it("has no view shortcuts outside a project", () => {
    expect(resolveShortcut(key("1"), false, "/")).toBeNull();
    expect(resolveShortcut(key("1"), false, "/tasks/abc")).toBeNull();
  });
});
