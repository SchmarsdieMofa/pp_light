export const NOTIFICATION_TYPES = ["assigned", "mentioned", "comment", "status", "schedule", "dueSoon", "overdue", "question", "questionResolved"] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];
