/** Mentions are stored inline as `@[Name](user:<uuid>)`; the autocomplete inserts this token. */
export const MENTION_PATTERN = /@\[([^\]\n]{1,80})\]\(user:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/g;

export function mentionToken(name: string, userId: string): string {
  const clean = name.replace(/[[\]\n]/g, "").trim().slice(0, 80) || "Unbekannt";
  return `@[${clean}](user:${userId})`;
}

export function parseMentionIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) ids.add(match[2]);
  return [...ids];
}
