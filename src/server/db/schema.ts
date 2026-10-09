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
  pgView,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { CARD_DENSITIES, GLOBAL_ROLES, PROJECT_ROLES, QUESTION_STATUSES, TASK_PRIORITIES, THEMES } from "@/lib/enums";

export const globalRole = pgEnum("global_role", GLOBAL_ROLES);
export const projectRole = pgEnum("project_role", PROJECT_ROLES);
export const themePref = pgEnum("theme_pref", THEMES);
export const cardDensity = pgEnum("card_density", CARD_DENSITIES);
export const taskPriority = pgEnum("task_priority", TASK_PRIORITIES);
export const questionStatus = pgEnum("question_status", QUESTION_STATUSES);

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
  /** The folder the project lives in (flat, at most one). Its people have access here too – see `project_access`. */
  folderId: uuid("folder_id").references((): AnyPgColumn => projectFolders.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("projects_folder_idx").on(t.folderId)]);

export const projectFolders = pgTable("project_folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
});

/** People in a folder have `role` in every project of it (owner: owner everywhere). */
export const folderMembers = pgTable(
  "folder_members",
  {
    folderId: uuid("folder_id").notNull().references(() => projectFolders.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: projectRole("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.folderId, t.userId] }), index("folder_members_user_idx").on(t.userId)],
);

/** A whole group in a folder (member or guest, never owner – like in projects). */
export const folderGroups = pgTable(
  "folder_groups",
  {
    folderId: uuid("folder_id").notNull().references(() => projectFolders.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").notNull().references(() => userGroups.id, { onDelete: "cascade" }),
    role: projectRole("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.folderId, t.groupId] }), index("folder_groups_group_idx").on(t.groupId)],
);

/** Who is in which folder, as what: direct and via groups, highest role wins. Created in migration 0016. */
export const folderAccess = pgView("folder_access", {
  folderId: uuid("folder_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: projectRole("role").notNull(),
}).existing();

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
  /** When the welcome tour was finished or skipped; null shows it after the next login. */
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    phaseId: uuid("phase_id").references(() => phases.id, { onDelete: "set null" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    /** Top-level: the project's running number. Subtask: its position among its siblings. */
    number: integer("number").notNull(),
    /** Display number: "3" for a top-level task, "3.1" / "3.1.2" for its subtasks. Never changes. */
    path: text("path").notNull(),
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
    uniqueIndex("tasks_project_path_uq").on(t.projectId, t.path),
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

/** A question to the whole project: a thread that ends as "resolved" with a summary. The first post is the question itself. */
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    authorId: uuid("author_id").notNull().references(() => users.id),
    status: questionStatus("status").notNull().default("open"),
    /** What was settled; required to resolve, kept when reopened until the next resolution. */
    summary: text("summary").notNull().default(""),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("questions_project_idx").on(t.projectId, t.lastActivityAt)],
);

export const questionPosts = pgTable(
  "question_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [index("question_posts_question_idx").on(t.questionId, t.createdAt)],
);

export const questionPostMentions = pgTable(
  "question_post_mentions",
  {
    postId: uuid("post_id").notNull().references(() => questionPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] }), index("question_post_mentions_user_idx").on(t.userId)],
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
    questionId: uuid("question_id").references((): AnyPgColumn => questions.id, { onDelete: "set null" }),
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
  disabledEmailTypes: jsonb("disabled_email_types").$type<string[]>().notNull().default(["assigned", "status"]),
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

/** A named set of people (e.g. a team). Admins maintain them; an owner adds a whole group to a project in one step. */
export const userGroups = pgTable(
  "user_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("user_groups_name_idx").on(sql`lower(${t.name})`)],
);

export const userGroupMembers = pgTable(
  "user_group_members",
  {
    groupId: uuid("group_id").notNull().references(() => userGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("user_group_members_user_idx").on(t.userId)],
);

/** A whole group is part of a project: everyone in it has `role` there – for as long as they are in the group. */
export const projectGroups = pgTable(
  "project_groups",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").notNull().references(() => userGroups.id, { onDelete: "cascade" }),
    role: projectRole("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.groupId] }), index("project_groups_group_idx").on(t.groupId)],
);

/** A project a person pinned for quick access: it sits at the top of their sidebar. Per person, follows them across devices. */
export const projectPins = pgTable(
  "project_pins",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] }), index("project_pins_project_idx").on(t.projectId)],
);

/**
 * Who may see which project, and as what: direct memberships, memberships through groups and through the
 * project's folder, the highest role winning (owner > member > guest). Created in migration 0014, extended in
 * 0016 – read access checks from here, write direct memberships to `project_members`, group links to
 * `project_groups`, folder access to `folder_members` / `folder_groups`.
 */
export const projectAccess = pgView("project_access", {
  projectId: uuid("project_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: projectRole("role").notNull(),
}).existing();
