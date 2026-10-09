export type Shortcut =
  | { kind: "palette" }
  | { kind: "help" }
  | { kind: "newTask" }
  | { kind: "closePanel" }
  | { kind: "view"; href: string };

type KeyInput = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean };
type TargetLike = { tagName?: string; type?: string; isContentEditable?: boolean } | null;

const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"]);

/** True while the user types somewhere – single-key shortcuts must not fire then. */
export function isTypingTarget(target: TargetLike): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !NON_TEXT_INPUTS.has((target.type ?? "text").toLowerCase());
  return false;
}

export const SHORTCUT_HELP = [
  { keys: "Strg + K", text: "Suche und Befehle" },
  { keys: "C", text: "Neue Aufgabe" },
  { keys: "1 / 2 / 3 / 4", text: "Board / Gantt / Liste / Fragen" },
  { keys: "Esc", text: "Aufgabe schließen" },
  { keys: "?", text: "Diese Hilfe" },
] as const;

const VIEWS = { "1": "board", "2": "gantt", "3": "list", "4": "questions" } as const;

export function resolveShortcut(event: KeyInput, typing: boolean, pathname: string): Shortcut | null {
  const withModifier = event.ctrlKey || event.metaKey;
  if (withModifier && !event.altKey && event.key.toLowerCase() === "k") return { kind: "palette" };
  if (typing || withModifier || event.altKey) return null;
  if (event.key === "?") return { kind: "help" };
  if (event.key === "Escape") return { kind: "closePanel" };
  if (event.key.toLowerCase() === "c") return { kind: "newTask" };
  const view = VIEWS[event.key as keyof typeof VIEWS];
  const project = /^\/projects\/([0-9a-f-]{36})(?:\/|$)/.exec(pathname);
  if (view && project) return { kind: "view", href: `/projects/${project[1]}/${view}` };
  return null;
}
