export const NOTIFICATION_TYPES = ["assigned", "mentioned", "comment", "status", "schedule", "dueSoon", "overdue"] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];
