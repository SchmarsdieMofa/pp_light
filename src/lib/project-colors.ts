/** Distinct, readable in light and dark. A project keeps its color as long as the project list does not change. */
export const PROJECT_COLORS = ["#3b82f6", "#10b981", "#a855f7", "#f97316", "#ec4899", "#14b8a6", "#eab308", "#ef4444", "#6366f1", "#84cc16"];

/** Color per project id, by its place in `projects` (the user's alphabetical project list). */
export function projectColors(projects: { id: string }[]): (projectId: string) => string {
  const map = new Map(projects.map((p, i) => [p.id, PROJECT_COLORS[i % PROJECT_COLORS.length]]));
  return (projectId) => map.get(projectId) ?? PROJECT_COLORS[0];
}
