export const GLOBAL_ROLES = ["admin", "manager", "member"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export const PROJECT_ROLES = ["owner", "member", "guest"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const CARD_DENSITIES = ["compact", "medium", "full"] as const;
export type CardDensity = (typeof CARD_DENSITIES)[number];

export const TASK_PRIORITIES = ["none", "low", "med", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
