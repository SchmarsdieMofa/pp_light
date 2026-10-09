export const NOTIFICATION_TYPES = ["assigned", "mentioned", "comment", "status", "schedule", "dueSoon", "overdue", "question", "questionResolved"] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  assigned: "Zuweisung", mentioned: "Erwähnung", comment: "Kommentar", status: "Statuswechsel",
  schedule: "Terminänderung", dueSoon: "Bald fällig", overdue: "Überfällig",
  question: "Antwort auf eine Frage", questionResolved: "Frage geklärt",
};

/** Types that send no e-mail until the person turns them on: status changes and assignments are the noisy ones. */
export const DEFAULT_DISABLED_EMAIL_TYPES: readonly NotificationType[] = ["assigned", "status"];
