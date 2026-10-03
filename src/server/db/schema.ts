import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { CARD_DENSITIES, GLOBAL_ROLES, PROJECT_ROLES, TASK_PRIORITIES, THEMES } from "@/lib/enums";

export const globalRole = pgEnum("global_role", GLOBAL_ROLES);
export const projectRole = pgEnum("project_role", PROJECT_ROLES);
export const themePref = pgEnum("theme_pref", THEMES);
export const cardDensity = pgEnum("card_density", CARD_DENSITIES);
export const taskPriority = pgEnum("task_priority", TASK_PRIORITIES);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  role: globalRole("role").notNull().default("member"),
  active: boolean("active").notNull().default(true),
  /** Bumped on password reset; sessions carrying an older value are rejected. */
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: createdAt(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  key: text("key").notNull().unique(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  /** Set when the project was closed through the review (archivedAt is set too); null for a plain archive. */
  completedAt: timestamp("completed_at", { withTimezone: true }),
  closingNote: text("closing_note").notNull().default(""),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  taskCounter: integer("task_counter").notNull().default(0),
  createdAt: createdAt(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: projectRole("role").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_members_user_idx").on(t.userId),
  ],
);

export const statuses = pgTable(
  "statuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    position: text("position").notNull(),
    isDone: boolean("is_done").notNull().default(false),
  },
  (t) => [index("statuses_project_idx").on(t.projectId)],
);

export const phases = pgTable(
  "phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    isMilestone: boolean("is_milestone").notNull().default(false),
    position: text("position").notNull(),
  },
  (t) => [
    uniqueIndex("phases_project_name_uq").on(t.projectId, sql`lower(${t.name})`),
    index("phases_project_idx").on(t.projectId),
    check("phases_dates_ck", sql`${t.startDate} is null or ${t.endDate} is null or ${t.startDate} <= ${t.endDate}`),
    check("phases_milestone_ck", sql`not ${t.isMilestone} or (${t.startDate} is not null and ${t.startDate} = ${t.endDate})`),
  ],
);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  theme: themePref("theme").notNull().default("system"),
  cardDensity: cardDensity("card_density").notNull().default("medium"),
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    phaseId: uuid("phase_id").references(() => phases.id, { onDelete: "set null" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    statusId: uuid("status_id").notNull().references(() => statuses.id),
    priority: taskPriority("priority").notNull().default("none"),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    position: text("position").notNull(),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("tasks_project_number_uq").on(t.projectId, t.number),
    index("tasks_project_idx").on(t.projectId),
    index("tasks_parent_idx").on(t.parentId),
    index("tasks_phase_idx").on(t.phaseId),
    index("tasks_status_idx").on(t.statusId),
    // Full-text search (Strg+K): expression index instead of a stored column keeps `select *` lean.
    index("tasks_search_idx").using("gin", sql`to_tsvector('german', ${t.title} || ' ' || ${t.description})`),
    check("tasks_dates_ck", sql`${t.startDate} is null or ${t.dueDate} is null or ${t.startDate} <= ${t.dueDate}`),
  ],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    blockerId: uuid("blocker_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    lagDays: integer("lag_days").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index("task_dependencies_blocked_idx").on(t.blockedId),
    check("task_dependencies_distinct_ck", sql`${t.blockerId} <> ${t.blockedId}`),
    check("task_dependencies_lag_ck", sql`${t.lagDays} >= 0`),
  ],
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] }), index("task_assignees_user_idx").on(t.userId)],
);

export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
  },
  (t) => [uniqueIndex("labels_project_name_uq").on(t.projectId, sql`lower(${t.name})`)],
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] }), index("task_labels_label_idx").on(t.labelId)],
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    position: text("position").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("checklist_items_task_idx").on(t.taskId)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").notNull().references(() => users.id),
    action: text("action").notNull(),
    diff: jsonb("diff").$type<Record<string, unknown>>().notNull().default({}),
    groupId: uuid("group_id"),
    createdAt: createdAt(),
  },
  (t) => [index("activity_log_task_idx").on(t.taskId), index("activity_log_project_idx").on(t.projectId)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [index("comments_task_idx").on(t.taskId)],
);

export const commentMentions = pgTable(
  "comment_mentions",
  {
    commentId: uuid("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] }), index("comment_mentions_user_idx").on(t.userId)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_task_idx").on(t.taskId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    eventKey: text("event_key").notNull().unique(),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)],
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  disabledEmailTypes: jsonb("disabled_email_types").$type<string[]>().notNull().default([]),
  lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
});

export const mailOutbox = pgTable("mail_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Failed logins per e-mail and per client IP (Postgres only – no Redis needed). */
export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authTokens = pgTable(
  "auth_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userId)],
);

export const oidcAccounts = pgTable(
  "oidc_accounts",
  {
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.subject] }), index("oidc_accounts_user_idx").on(t.userId)],
);

/**
 * Backups are run by the separate `backup` container (docker/backup.sh), which polls this table:
 * the app queues manual runs as "pending", the container claims, runs and finishes them and logs scheduled runs here too.
 */
export const backupRuns = pgTable(
  "backup_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trigger: text("trigger").notNull().$type<"manual" | "scheduled">(),
    status: text("status").notNull().default("pending").$type<"pending" | "running" | "done" | "failed">(),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    /** Folder name in the backup directory, e.g. 2026-10-02_0200. */
    name: text("name"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    error: text("error"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("backup_runs_created_idx").on(t.createdAt),
    // At most one queued and one running backup – a double click cannot queue two.
    uniqueIndex("backup_runs_active_idx").on(t.status).where(sql`${t.status} in ('pending', 'running')`),
    check("backup_runs_trigger_check", sql`${t.trigger} in ('manual', 'scheduled')`),
    check("backup_runs_status_check", sql`${t.status} in ('pending', 'running', 'done', 'failed')`),
  ],
);

/** Instance-wide settings: exactly one row (id = 1), created on first use. */
export const appSettings = pgTable(
  "app_settings",
  {
    id: integer("id").primaryKey().default(1),
    /** Redirect plain HTTP to HTTPS. Only switched on from a request that came in over HTTPS. */
    httpsOnly: boolean("https_only").notNull().default(false),
    /** Address used in links in mails, e.g. https://pp.firma.local. Taken from the setup request. */
    baseUrl: text("base_url"),
    /** SHA-256 of the one-time setup code while nobody has set the instance up yet. */
    setupCodeHash: text("setup_code_hash"),
  },
  (t) => [check("app_settings_single_row", sql`${t.id} = 1`)],
);
