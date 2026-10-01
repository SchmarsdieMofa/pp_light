import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { CARD_DENSITIES, GLOBAL_ROLES, PROJECT_ROLES, THEMES } from "@/lib/enums";

export const globalRole = pgEnum("global_role", GLOBAL_ROLES);
export const projectRole = pgEnum("project_role", PROJECT_ROLES);
export const themePref = pgEnum("theme_pref", THEMES);
export const cardDensity = pgEnum("card_density", CARD_DENSITIES);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  role: globalRole("role").notNull().default("member"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  key: text("key").notNull().unique(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
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

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  theme: themePref("theme").notNull().default("system"),
  cardDensity: cardDensity("card_density").notNull().default("medium"),
});
