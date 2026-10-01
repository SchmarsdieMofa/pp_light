export type SearchParams = Record<string, string | undefined>;

export function normalizeSearchParams(raw: Record<string, string | string[] | undefined>): SearchParams {
  const out: SearchParams = {};
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) out[key] = first;
  }
  return out;
}

/** Returns `path` with `params`, where `overrides` set (string) or remove (null) single keys. */
export function buildHref(path: string, params: SearchParams, overrides: Record<string, string | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && !(key in overrides)) search.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== null) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
