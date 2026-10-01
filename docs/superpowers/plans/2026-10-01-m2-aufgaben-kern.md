# M2 Aufgaben-Kern – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aufgaben werden zum Kern von pp_light:
- Anlegen per Schnell-Eingabe mit Nummer `KEY-n`
- Unteraufgaben (eine Ebene), Checklisten, Labels, Priorität, Zuständige, Start-/Fälligkeitsdatum
- Listenansicht mit Filtern und Sortierung
- Aufgaben-Panel rechts plus eigene Seite `/tasks/[id]`
- Konfliktprüfung beim Bearbeiten, Aktivitätslog

**Architecture:** Wie in M1:
- Die Fachlogik liegt in `src/server/<modul>/`. Services bekommen `db` als ersten Parameter, prüfen Eingaben per zod und Rechte per `assertCan`.
- Lesende Abfragen für die UI liegen in `src/server/tasks/queries.ts`.
- Server Actions sind dünn: `requireActor` → `runAction` → Service → `revalidatePath("/", "layout")`. Die UI aktualisiert sich dadurch im selben Roundtrip.
- Das Panel ist kein Parallel-Route-Konstrukt, sondern ein Query-Parameter `?task=<id>` auf Board und Liste.

**Tech Stack:** wie M1 (Next.js 16.3, Drizzle 0.45, zod 4, Vitest 5, Playwright 1.63, shadcn/Base UI). Neu ist nur `fractional-indexing.generateKeyBetween` (schon installiert).

**Spec:** `docs/superpowers/specs/2026-09-30-pp-light-design.md` · **Roadmap:** `docs/superpowers/plans/2026-10-01-roadmap.md` · **Vorgänger:** M1 (in `main`)

## Global Constraints

- Alle Constraints aus M1 gelten weiter. Die wichtigsten:
  - `src/server/**` importiert nie aus `src/app/**` oder `src/components/**`
  - Services importieren kein `next/*`
  - Sortierung über `position` immer mit `byPosition()`
  - UI-Texte auf Deutsch
- Prioritäten exakt wie in der Spec: `none | low | med | high | urgent`. Anzeige: Keine / Niedrig / Mittel / Hoch / Dringend
- Aufgabennummer `KEY-n`, pro Projekt fortlaufend über `projects.task_counter` in derselben Transaktion
- Unteraufgaben nur eine Ebene tief. Der Parent wird **nie** automatisch „Fertig“; es erscheint nur ein Hinweis
- Checklisten-Punkte haben weder Status noch Zuständige
- Der Editor speichert Feldänderungen nacheinander (Warteschlange), damit eigene schnelle Änderungen sich nicht gegenseitig als Konflikt melden
- Konfliktprüfung: Feldänderungen (Titel, Beschreibung, Status, Priorität, Daten) verlangen das zuletzt gesehene `updatedAt` und liefern bei Abweichung `CONFLICT` „Die Aufgabe wurde zwischenzeitlich geändert.“. Zuständige, Labels und Checkliste sind Mengen-Operationen ohne Konfliktprüfung
- `updated_at` mit Millisekunden-Präzision (`precision: 3`), damit der Vergleich mit JS-`Date` exakt ist
- Fremde oder ungültige Aufgaben-IDs → `NOT_FOUND` bzw. 404, nie 500 und ohne Hinweis, ob die Aufgabe existiert
- Gäste (Projektrolle `guest`) sehen Aufgaben, können aber nichts ändern (`task.update`/`task.create` fehlen)
- Labels verwalten (anlegen/löschen) darf nur, wer `project.update` hat (Owner, Admin)
- Beschreibung in M2 als Klartext (`whitespace-pre-wrap`). Markdown-Rendering kommt mit den Kommentaren in M6
- Aktivitätslog wird in M2 nur **geschrieben** (für Benachrichtigungen in M7 und den Verlauf in M6), nicht angezeigt
- Board in M2 zeigt Karten nur lesend (Nummer + Titel, Klick öffnet das Panel). Drag & Drop und Kartendichte folgen in M3
- Mitgliederverwaltung folgt in M3; Zuständige sind in M2 nur die vorhandenen Projektmitglieder
- Commits: Conventional Commits, Trailer laut Session-Vorgabe

## Review Focus

1. **Zwei Personen bearbeiten dieselbe Aufgabe gleichzeitig.** Wer als Zweiter speichert, bekommt die Konfliktmeldung mit „Neu laden“ statt stillem Überschreiben. Das gilt auch, wenn zwischendurch eine Checkliste umgeschaltet wurde, die die Seite neu rendert. *Test: Task 4 (Service, auch parallel) + E2E Task 11*
2. **Manipulierte oder veraltete IDs in Actions und URLs:**
   - Aufgabe, Label, Status oder Nutzer aus einem anderen Projekt
   - kaputte UUID in `?task=`
   - Filter-Parameter wie `?status=abc`
   → Fehlermeldung bzw. 404 oder der Filter wird ignoriert, nie 500 und nie projektübergreifende Verknüpfungen. *Test: Tasks 3, 5, 6, 7, 8*
3. **Viele gleichzeitig angelegte Aufgaben** (Schnell-Eingabe, zwei Personen) → lückenlose, eindeutige Nummern. *Test: Task 3*
4. **Startdatum nach dem Fälligkeitsdatum**, auch wenn nur eines der beiden Felder geändert wird → verständliche Meldung, die DB-Constraint greift als zweite Linie. *Test: Task 4 + Task 2*
5. **Suche mit Sonderzeichen** (`%`, `_`, `\`) oder nach Nummer (`TSK-3`, `3`) → findet wörtlich bzw. per Nummer, kein SQL-Fehler. *Test: Task 7*

---

## Dateistruktur (neu/geändert)

```
src/lib/enums.ts                       # + TASK_PRIORITIES
src/lib/labels.ts                      # Farbpalette für Labels
src/lib/priority.ts                    # Anzeige-Texte
src/lib/dates.ts                       # formatDate, isOverdue, todayIso
src/lib/urls.ts                        # buildHref (Query-Parameter setzen/entfernen)
src/lib/task-list-params.ts            # URL → Filter/Sortierung (robust)
src/lib/schemas/task.ts                # createTaskSchema, updateTaskSchema, labelSchema
src/server/errors.ts                   # + LABEL_TAKEN
src/server/db/client.ts                # + Executor
src/server/db/schema.ts                # + tasks, task_assignees, labels, task_labels, checklist_items, activity_log
src/server/permissions/index.ts        # + projectCtx
src/server/projects/service.ts         # + requireProjectAccess, listMembers
src/server/activity/service.ts         # recordActivity, listActivity
src/server/tasks/access.ts             # loadTaskAccess
src/server/tasks/service.ts            # createTask, updateTask
src/server/tasks/relations.ts          # setTaskAssignees, setTaskLabels
src/server/labels/service.ts           # createLabel, deleteLabel, listLabels
src/server/checklists/service.ts       # add/toggle/delete/list
src/server/tasks/queries.ts            # listProjectTasks, getTaskDetail
src/app/(app)/tasks/actions.ts         # Task-/Checklisten-/Relations-Actions
src/app/(app)/projects/actions.ts      # + createLabelAction, deleteLabelAction
src/app/(app)/tasks/[id]/page.tsx      # Aufgabe als eigene Seite
src/app/(app)/projects/[id]/{board,list,settings}/page.tsx   # erweitert
src/components/tasks/*                 # quick-add, task-table, task-filters, task-panel, task-editor, …
src/components/projects/label-manager.tsx
tests/unit/*.test.ts, tests/e2e/tasks.spec.ts
```

---

### Task 1: Hilfsfunktionen (Datum, URLs, Listen-Parameter)

**Files:**
- Create: `src/lib/dates.ts`, `src/lib/urls.ts`, `src/lib/task-list-params.ts`, `src/lib/priority.ts`, `src/lib/labels.ts`, `tests/unit/lib.test.ts`
- Modify: `src/lib/enums.ts`

**Interfaces:**
- Produces:
  - `TASK_PRIORITIES = ["none","low","med","high","urgent"] as const`, `type TaskPriority`
  - `PRIORITY_LABELS: Record<TaskPriority, string>`
  - `LABEL_COLORS: readonly { value: string; name: string }[]`
  - `todayIso(now?: Date): string`, `formatDate(iso: string | null): string`, `isOverdue(dueDate: string | null, isDone: boolean, today?: string): boolean`
  - `type SearchParams = Record<string, string | undefined>`, `normalizeSearchParams(raw: Record<string, string | string[] | undefined>): SearchParams`, `buildHref(path: string, params: SearchParams, overrides: Record<string, string | null>): string`
  - `type TaskListFilters = { statusId?: string; assigneeId?: string; labelId?: string; priority?: TaskPriority; q?: string }`, `type TaskSortField = "number" | "title" | "status" | "priority" | "dueDate"`, `type TaskSort = { field: TaskSortField; dir: "asc" | "desc" }`, `parseTaskListParams(params: SearchParams): { filters: TaskListFilters; sort: TaskSort }`

- [ ] **Step 1: Fehlschlagenden Test schreiben** – `tests/unit/lib.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { formatDate, isOverdue, todayIso } from "@/lib/dates";
import { parseTaskListParams } from "@/lib/task-list-params";
import { buildHref, normalizeSearchParams } from "@/lib/urls";

describe("dates", () => {
  it("formats ISO dates the German way", () => {
    expect(formatDate("2026-10-14")).toBe("14.10.2026");
    expect(formatDate(null)).toBe("");
  });

  it("uses the local calendar day for today", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("flags overdue only for open tasks with a past due date", () => {
    expect(isOverdue("2026-10-01", false, "2026-10-02")).toBe(true);
    expect(isOverdue("2026-10-02", false, "2026-10-02")).toBe(false);
    expect(isOverdue("2026-10-01", true, "2026-10-02")).toBe(false);
    expect(isOverdue(null, false, "2026-10-02")).toBe(false);
  });
});

describe("urls", () => {
  it("keeps the first value of repeated params and drops empty ones", () => {
    expect(normalizeSearchParams({ a: ["1", "2"], b: "", c: undefined, d: "x" })).toEqual({ a: "1", d: "x" });
  });

  it("sets and removes params while keeping the rest", () => {
    expect(buildHref("/p/1/list", { status: "s1", task: "t1" }, { task: "t2" })).toBe("/p/1/list?status=s1&task=t2");
    expect(buildHref("/p/1/list", { status: "s1", task: "t1" }, { task: null })).toBe("/p/1/list?status=s1");
    expect(buildHref("/p/1/list", {}, { task: null })).toBe("/p/1/list");
  });

  it("encodes values", () => {
    expect(buildHref("/x", {}, { q: "a&b c" })).toBe("/x?q=a%26b+c");
  });
});

describe("parseTaskListParams", () => {
  const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

  it("defaults to sorting by number ascending without filters", () => {
    expect(parseTaskListParams({})).toEqual({ filters: {}, sort: { field: "number", dir: "asc" } });
  });

  it("accepts valid filters and sort", () => {
    expect(
      parseTaskListParams({ status: uuid, assignee: uuid, label: uuid, priority: "high", q: " logo ", sort: "dueDate", dir: "desc" }),
    ).toEqual({
      filters: { statusId: uuid, assigneeId: uuid, labelId: uuid, priority: "high", q: "logo" },
      sort: { field: "dueDate", dir: "desc" },
    });
  });

  it("ignores invalid values instead of failing", () => {
    expect(parseTaskListParams({ status: "abc", priority: "mega", sort: "drop table", dir: "up", q: "   " })).toEqual({
      filters: {},
      sort: { field: "number", dir: "asc" },
    });
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/unit/lib.test.ts`
Expected: FAIL – `Cannot find package '@/lib/dates'`

- [ ] **Step 3: Implementieren**

`src/lib/enums.ts` – am Ende ergänzen:
```ts

export const TASK_PRIORITIES = ["none", "low", "med", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
```

`src/lib/priority.ts`:
```ts
import type { TaskPriority } from "./enums";

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "Keine",
  low: "Niedrig",
  med: "Mittel",
  high: "Hoch",
  urgent: "Dringend",
};
```

`src/lib/labels.ts`:
```ts
export const LABEL_COLORS = [
  { value: "#ef4444", name: "Rot" },
  { value: "#f97316", name: "Orange" },
  { value: "#eab308", name: "Gelb" },
  { value: "#22c55e", name: "Grün" },
  { value: "#06b6d4", name: "Türkis" },
  { value: "#3b82f6", name: "Blau" },
  { value: "#a855f7", name: "Lila" },
  { value: "#64748b", name: "Grau" },
] as const;
```

`src/lib/dates.ts`:
```ts
/** Local calendar day as YYYY-MM-DD (not UTC – a task due "today" must not flip at 01:00). */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function isOverdue(dueDate: string | null, isDone: boolean, today: string = todayIso()): boolean {
  return !!dueDate && !isDone && dueDate < today;
}
```

`src/lib/urls.ts`:
```ts
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
```

`src/lib/task-list-params.ts`:
```ts
import { z } from "zod";
import { TASK_PRIORITIES, type TaskPriority } from "./enums";
import type { SearchParams } from "./urls";

export type TaskListFilters = {
  statusId?: string;
  assigneeId?: string;
  labelId?: string;
  priority?: TaskPriority;
  q?: string;
};
export const TASK_SORT_FIELDS = ["number", "title", "status", "priority", "dueDate"] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];
export type TaskSort = { field: TaskSortField; dir: "asc" | "desc" };

const uuid = z.uuid();

function valid<T>(schema: z.ZodType<T>, value: string | undefined): T | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

/** URL params are user input: anything invalid is dropped, never passed on to SQL. */
export function parseTaskListParams(params: SearchParams): { filters: TaskListFilters; sort: TaskSort } {
  const filters: TaskListFilters = {};
  const statusId = valid(uuid, params.status);
  const assigneeId = valid(uuid, params.assignee);
  const labelId = valid(uuid, params.label);
  const priority = valid(z.enum(TASK_PRIORITIES), params.priority);
  const q = params.q?.trim();
  if (statusId) filters.statusId = statusId;
  if (assigneeId) filters.assigneeId = assigneeId;
  if (labelId) filters.labelId = labelId;
  if (priority) filters.priority = priority;
  if (q) filters.q = q.slice(0, 100);

  return {
    filters,
    sort: {
      field: valid(z.enum(TASK_SORT_FIELDS), params.sort) ?? "number",
      dir: params.dir === "desc" ? "desc" : "asc",
    },
  };
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run tests/unit/lib.test.ts && npm run -s typecheck`
Expected: PASS (9 Tests), typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(lib): add date, url and task list param helpers"
```

---

### Task 2: Schema für Aufgaben, Labels, Checklisten, Aktivität

**Files:**
- Modify: `src/server/db/schema.ts`, `src/server/db/client.ts`, `src/server/errors.ts`, `src/server/permissions/index.ts`
- Create: `src/server/db/migrations/0001_*.sql` (generiert), `tests/unit/task-schema.test.ts`

**Interfaces:**
- Consumes: `TASK_PRIORITIES` (Task 1)
- Produces:
  - Tabellen `tasks`, `taskAssignees`, `labels`, `taskLabels`, `checklistItems`, `activityLog`; Enum `taskPriority`
  - `type Executor` (DB oder Transaktion) aus `client.ts`
  - `ErrorCode` um `"LABEL_TAKEN"` ergänzt
  - `projectCtx(role: ProjectRole | "admin" | null): PermissionContext`

- [ ] **Step 1: Fehlschlagenden Test schreiben** – `tests/unit/task-schema.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { labels, projects, statuses, tasks, users } from "@/server/db/schema";
import { resetDb, testDb } from "../helpers/db";

async function seed() {
  const [user] = await testDb.insert(users).values({ email: "a@example.com", name: "A" }).returning();
  const [project] = await testDb.insert(projects).values({ name: "P", key: "PRJ", createdBy: user.id }).returning();
  const [status] = await testDb
    .insert(statuses)
    .values({ projectId: project.id, name: "Offen", color: "#000", position: "a0" })
    .returning();
  const base = { projectId: project.id, statusId: status.id, createdBy: user.id, position: "a0" };
  return { user, project, status, base };
}

describe("task schema", () => {
  beforeEach(resetDb);

  it("stores a task with defaults and millisecond updated_at", async () => {
    const { base } = await seed();
    const [task] = await testDb.insert(tasks).values({ ...base, number: 1, title: "T" }).returning();
    expect(task.priority).toBe("none");
    expect(task.description).toBe("");
    expect(task.startDate).toBeNull();
    const { rows } = await testDb.$client.query<{ t: string }>("select updated_at::text as t from tasks");
    expect(rows[0].t).toMatch(/^\S+ \d{2}:\d{2}:\d{2}(\.\d{1,3})?[+-]/);
  });

  it("keeps task numbers unique per project", async () => {
    const { base } = await seed();
    await testDb.insert(tasks).values({ ...base, number: 1, title: "A" });
    await expect(testDb.insert(tasks).values({ ...base, number: 1, title: "B" })).rejects.toThrow();
  });

  it("rejects a start date after the due date", async () => {
    const { base } = await seed();
    await expect(
      testDb.insert(tasks).values({ ...base, number: 1, title: "A", startDate: "2026-10-10", dueDate: "2026-10-01" }),
    ).rejects.toThrow();
  });

  it("keeps label names unique per project, ignoring case", async () => {
    const { project } = await seed();
    await testDb.insert(labels).values({ projectId: project.id, name: "Design", color: "#000" });
    await expect(testDb.insert(labels).values({ projectId: project.id, name: "design", color: "#111" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/unit/task-schema.test.ts`
Expected: FAIL – `labels`/`tasks` sind keine Exporte von `@/server/db/schema` (Typfehler bzw. `undefined`-Fehler beim Insert)

- [ ] **Step 3: Schema erweitern** – `src/server/db/schema.ts`

Import-Block ersetzen:
```ts
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
```

Nach `cardDensity` ergänzen:
```ts
export const taskPriority = pgEnum("task_priority", TASK_PRIORITIES);
```

Am Dateiende ergänzen:
```ts
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
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
    index("tasks_status_idx").on(t.statusId),
    check("tasks_dates_ck", sql`${t.startDate} is null or ${t.dueDate} is null or ${t.startDate} <= ${t.dueDate}`),
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
```

`src/server/db/client.ts` – Importe und Typ ergänzen:
```ts
import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
```
und nach `export type DB = …`:
```ts
/** A DB handle or an open transaction – for helpers that must run inside a caller's transaction. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;
```

`src/server/errors.ts` – in `ErrorCode` ergänzen: `| "LABEL_TAKEN"`

`src/server/permissions/index.ts` – am Ende ergänzen:
```ts

/** Permission context for a project role as returned by getProjectForUser ("admin" = admin without membership). */
export function projectCtx(role: ProjectRole | "admin" | null): PermissionContext {
  return { projectRole: role === "admin" ? null : role };
}
```

- [ ] **Step 4: Migration erzeugen und anwenden**

Run: `npm run db:generate && npm run db:migrate`
Expected: neue Datei `src/server/db/migrations/0001_*.sql` mit `CREATE TABLE "tasks"` … `CONSTRAINT "tasks_dates_ck" CHECK` … `CREATE UNIQUE INDEX "labels_project_name_uq" … lower("name")`; Ausgabe `Migrationen ausgeführt`.

- [ ] **Step 5: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run && npm run -s typecheck`
Expected: PASS – alle bisherigen Tests und `task-schema.test.ts` (4)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add tasks, labels, checklists and activity log schema"
```

---

### Task 3: Aktivitätslog, Zugriffshelfer, Aufgaben anlegen

**Files:**
- Create: `src/lib/schemas/task.ts`, `src/server/activity/service.ts`, `src/server/tasks/access.ts`, `src/server/tasks/service.ts`, `tests/unit/tasks-create.test.ts`, `tests/helpers/fixtures.ts`
- Modify: `src/server/projects/service.ts`

**Interfaces:**
- Consumes: `Executor`, Tabellen (Task 2), `projectCtx` (Task 2), `getProjectForUser`, `listStatuses` (M1), `byPosition` (M1)
- Produces:
  - `createTaskSchema`, `type CreateTaskInput = z.input<typeof createTaskSchema>`; `updateTaskSchema`, `type TaskPatch = z.input<typeof updateTaskSchema>`; `labelSchema`, `type LabelInput`
  - `recordActivity(ex: Executor, entry: { projectId: string; taskId?: string | null; actorId: string; action: ActivityAction; diff?: Record<string, unknown>; groupId?: string | null }): Promise<void>`, `listActivity(db: DB, taskId: string): Promise<ActivityEntry[]>`, `type ActivityAction = "task.created" | "subtask.created" | "task.updated" | "task.assigneesChanged" | "task.labelsChanged"`
  - `requireProjectAccess(db: DB, actor: Actor, projectId: string): Promise<ProjectAccess>` (wirft `NOT_FOUND`)
  - `type Task`, `type TaskAccess = { task: Task; role: ProjectRole | "admin" }`, `loadTaskAccess(ex: Executor, actor: Actor, taskId: string): Promise<TaskAccess>` (wirft `NOT_FOUND`)
  - `createTask(db: DB, actor: Actor, input: CreateTaskInput): Promise<Task>`
  - Test-Helfer `tests/helpers/fixtures.ts`: `makeActor(email, role?)`, `makeProject(owner, key)`, `addMember(projectId, actor, role)`

- [ ] **Step 1: Test-Helfer und fehlschlagenden Test schreiben**

`tests/helpers/fixtures.ts`:
```ts
import type { ProjectRole } from "@/lib/enums";
import { projectMembers } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { createProject, listStatuses } from "@/server/projects/service";
import { createUser } from "@/server/users/service";
import { testDb } from "./db";

export async function makeActor(email: string, role: "admin" | "member" = "member"): Promise<Actor> {
  const u = await createUser(testDb, { email, name: email.split("@")[0], role });
  return { id: u.id, role: u.role, name: u.name, email: u.email };
}

export async function makeProject(owner: Actor, key: string) {
  const project = await createProject(testDb, owner, { name: `Projekt ${key}`, key });
  const statuses = await listStatuses(testDb, project.id);
  return { project, statuses, open: statuses[0], done: statuses.find((s) => s.isDone)! };
}

export async function addMember(projectId: string, actor: Actor, role: ProjectRole) {
  await testDb.insert(projectMembers).values({ projectId, userId: actor.id, role });
}
```

`tests/unit/tasks-create.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { listActivity } from "@/server/activity/service";
import { createTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

describe("createTask", () => {
  beforeEach(resetDb);

  it("numbers tasks per project, defaults to the first status and logs the creation", async () => {
    const ada = await makeActor("ada@example.com");
    const a = await makeProject(ada, "AAA");
    const b = await makeProject(ada, "BBB");
    const t1 = await createTask(testDb, ada, { projectId: a.project.id, title: "  Erste " });
    const t2 = await createTask(testDb, ada, { projectId: a.project.id, title: "Zweite" });
    const other = await createTask(testDb, ada, { projectId: b.project.id, title: "Andere" });

    expect([t1.number, t2.number, other.number]).toEqual([1, 2, 1]);
    expect(t1.title).toBe("Erste");
    expect(t1.statusId).toBe(a.open.id);
    expect(t1.completedAt).toBeNull();
    expect(t2.position > t1.position).toBe(true);
    expect((await listActivity(testDb, t1.id)).map((e) => e.action)).toEqual(["task.created"]);
  });

  it("hands out unique, gapless numbers under concurrency", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "CON");
    const created = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createTask(testDb, ada, { projectId: project.id, title: `T${i}` })),
    );
    expect(created.map((t) => t.number).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("sets completedAt when created directly in a done status", async () => {
    const ada = await makeActor("ada@example.com");
    const { project, done } = await makeProject(ada, "DON");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "Schon fertig", statusId: done.id });
    expect(task.completedAt).not.toBeNull();
  });

  it("creates subtasks one level deep only", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "SUB");
    const parent = await createTask(testDb, ada, { projectId: project.id, title: "Parent" });
    const child = await createTask(testDb, ada, { projectId: project.id, title: "Kind", parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
    expect((await listActivity(testDb, child.id)).map((e) => e.action)).toEqual(["subtask.created"]);
    await expect(
      createTask(testDb, ada, { projectId: project.id, title: "Enkel", parentId: child.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a parent or status from another project", async () => {
    const ada = await makeActor("ada@example.com");
    const a = await makeProject(ada, "PA");
    const b = await makeProject(ada, "PB");
    const foreign = await createTask(testDb, ada, { projectId: b.project.id, title: "Fremd" });
    await expect(
      createTask(testDb, ada, { projectId: a.project.id, title: "X", parentId: foreign.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createTask(testDb, ada, { projectId: a.project.id, title: "X", statusId: b.open.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("enforces permissions: guests may not create, non-members get NOT_FOUND", async () => {
    const ada = await makeActor("ada@example.com");
    const gast = await makeActor("gast@example.com");
    const fremd = await makeActor("fremd@example.com");
    const { project } = await makeProject(ada, "PER");
    await addMember(project.id, gast, "guest");
    await expect(createTask(testDb, gast, { projectId: project.id, title: "X" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(createTask(testDb, fremd, { projectId: project.id, title: "X" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("validates the title", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "VAL");
    await expect(createTask(testDb, ada, { projectId: project.id, title: "   " })).rejects.toBeInstanceOf(ZodError);
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/unit/tasks-create.test.ts`
Expected: FAIL – `Cannot find package '@/server/activity/service'`

- [ ] **Step 3: Implementieren**

`src/lib/schemas/task.ts`:
```ts
import { z } from "zod";
import { TASK_PRIORITIES } from "@/lib/enums";
import { LABEL_COLORS } from "@/lib/labels";

const title = z.string().trim().min(1, "Titel fehlt").max(200, "Höchstens 200 Zeichen");
const isoDate = z.iso.date("Ungültiges Datum");

export const createTaskSchema = z.object({
  projectId: z.uuid(),
  title,
  parentId: z.uuid().optional(),
  statusId: z.uuid().optional(),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title,
    description: z.string().max(20000, "Höchstens 20000 Zeichen"),
    statusId: z.uuid(),
    priority: z.enum(TASK_PRIORITIES),
    startDate: isoDate.nullable(),
    dueDate: isoDate.nullable(),
  })
  .partial();
export type TaskPatch = z.input<typeof updateTaskSchema>;

const colorValues = LABEL_COLORS.map((c) => c.value) as [string, ...string[]];

export const labelSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "Name fehlt").max(40, "Höchstens 40 Zeichen"),
  color: z.enum(colorValues, "Unbekannte Farbe"),
});
export type LabelInput = z.input<typeof labelSchema>;

export const checklistTextSchema = z.string().trim().min(1, "Text fehlt").max(300, "Höchstens 300 Zeichen");
```

`src/server/activity/service.ts`:
```ts
import { asc, eq } from "drizzle-orm";
import type { DB, Executor } from "@/server/db/client";
import { activityLog } from "@/server/db/schema";

export type ActivityAction =
  | "task.created"
  | "subtask.created"
  | "task.updated"
  | "task.assigneesChanged"
  | "task.labelsChanged";

export type ActivityEntry = typeof activityLog.$inferSelect;

export async function recordActivity(
  ex: Executor,
  entry: {
    projectId: string;
    taskId?: string | null;
    actorId: string;
    action: ActivityAction;
    diff?: Record<string, unknown>;
    groupId?: string | null;
  },
): Promise<void> {
  await ex.insert(activityLog).values({
    projectId: entry.projectId,
    taskId: entry.taskId ?? null,
    actorId: entry.actorId,
    action: entry.action,
    diff: entry.diff ?? {},
    groupId: entry.groupId ?? null,
  });
}

export function listActivity(db: DB, taskId: string): Promise<ActivityEntry[]> {
  return db
    .select()
    .from(activityLog)
    .where(eq(activityLog.taskId, taskId))
    .orderBy(asc(activityLog.createdAt));
}
```

`src/server/projects/service.ts` – Importe ergänzen (`users` aus dem Schema) und am Ende anhängen:
```ts

/** Like getProjectForUser, but throws NOT_FOUND (for services/actions). */
export async function requireProjectAccess(db: DB, actor: Actor, projectId: string): Promise<ProjectAccess> {
  const access = await getProjectForUser(db, actor, projectId);
  if (!access) throw new DomainError("NOT_FOUND", "Projekt nicht gefunden.");
  return access;
}

export type Member = { id: string; name: string; email: string; role: ProjectRole };

export function listMembers(db: DB, projectId: string): Promise<Member[]> {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(users.name));
}
```
(Import-Zeile wird zu `import { projectMembers, projects, statuses, users } from "@/server/db/schema";`)

`src/server/tasks/access.ts`:
```ts
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ProjectRole } from "@/lib/enums";
import type { Executor } from "@/server/db/client";
import { projectMembers, tasks } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import type { Actor } from "@/server/permissions";

export type Task = typeof tasks.$inferSelect;
export type TaskAccess = { task: Task; role: ProjectRole | "admin" };

const notFound = () => new DomainError("NOT_FOUND", "Aufgabe nicht gefunden.");

/** Task plus the actor's project role. Missing task and missing access look the same (no leak). */
export async function loadTaskAccess(ex: Executor, actor: Actor, taskId: string): Promise<TaskAccess> {
  if (!z.uuid().safeParse(taskId).success) throw notFound();
  const [row] = await ex
    .select({ task: tasks, role: projectMembers.role })
    .from(tasks)
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, tasks.projectId), eq(projectMembers.userId, actor.id)))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row) throw notFound();
  if (row.role) return { task: row.task, role: row.role };
  if (actor.role === "admin") return { task: row.task, role: "admin" };
  throw notFound();
}
```

`src/server/tasks/service.ts`:
```ts
import { and, desc, eq, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { createTaskSchema, type CreateTaskInput } from "@/lib/schemas/task";
import { recordActivity } from "@/server/activity/service";
import type { DB, Executor } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { projects, statuses, tasks } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { requireProjectAccess } from "@/server/projects/service";
import type { Task } from "./access";

async function resolveStatus(ex: Executor, projectId: string, statusId?: string) {
  if (statusId) {
    const [status] = await ex
      .select()
      .from(statuses)
      .where(and(eq(statuses.id, statusId), eq(statuses.projectId, projectId)))
      .limit(1);
    if (!status) throw new DomainError("VALIDATION", "Unbekannter Status.");
    return status;
  }
  const [first] = await ex
    .select()
    .from(statuses)
    .where(eq(statuses.projectId, projectId))
    .orderBy(byPosition(statuses.position))
    .limit(1);
  if (!first) throw new DomainError("VALIDATION", "Das Projekt hat keine Status-Spalten.");
  return first;
}

async function nextPosition(ex: Executor, statusId: string): Promise<string> {
  const [last] = await ex
    .select({ position: tasks.position })
    .from(tasks)
    .where(eq(tasks.statusId, statusId))
    .orderBy(desc(byPosition(tasks.position)))
    .limit(1);
  return generateKeyBetween(last?.position ?? null, null);
}

export async function createTask(db: DB, actor: Actor, raw: CreateTaskInput): Promise<Task> {
  const input = createTaskSchema.parse(raw);
  const access = await requireProjectAccess(db, actor, input.projectId);
  assertCan(actor, "task.create", projectCtx(access.role));

  return db.transaction(async (tx) => {
    if (input.parentId) {
      const [parent] = await tx.select().from(tasks).where(eq(tasks.id, input.parentId)).limit(1);
      if (!parent || parent.projectId !== input.projectId) {
        throw new DomainError("VALIDATION", "Übergeordnete Aufgabe nicht gefunden.");
      }
      if (parent.parentId) {
        throw new DomainError("VALIDATION", "Unteraufgaben können keine eigenen Unteraufgaben haben.");
      }
    }
    const status = await resolveStatus(tx, input.projectId, input.statusId);
    // Row lock on the project serializes concurrent creations → unique, gapless numbers.
    const [{ taskCounter }] = await tx
      .update(projects)
      .set({ taskCounter: sql`${projects.taskCounter} + 1` })
      .where(eq(projects.id, input.projectId))
      .returning({ taskCounter: projects.taskCounter });

    const [task] = await tx
      .insert(tasks)
      .values({
        projectId: input.projectId,
        parentId: input.parentId ?? null,
        number: taskCounter,
        title: input.title,
        statusId: status.id,
        position: await nextPosition(tx, status.id),
        createdBy: actor.id,
        completedAt: status.isDone ? new Date() : null,
      })
      .returning();

    await recordActivity(tx, {
      projectId: input.projectId,
      taskId: task.id,
      actorId: actor.id,
      action: input.parentId ? "subtask.created" : "task.created",
      diff: { title: task.title, parentId: task.parentId },
    });
    return task;
  });
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run && npm run -s typecheck`
Expected: PASS – `tasks-create.test.ts` (7), alle anderen grün

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tasks): create tasks with per-project numbering, subtasks and activity log"
```

---

### Task 4: Aufgaben bearbeiten mit Konfliktprüfung

**Files:**
- Modify: `src/server/tasks/service.ts`
- Create: `tests/unit/tasks-update.test.ts`

**Interfaces:**
- Consumes: `loadTaskAccess` (Task 3), `updateTaskSchema`, `TaskPatch` (Task 3), `resolveStatus` (Task 3, modulintern)
- Produces: `updateTask(db: DB, actor: Actor, taskId: string, expectedUpdatedAt: string, patch: TaskPatch): Promise<Task>`. Wirft `CONFLICT` bei veraltetem Stand, `VALIDATION` bei Start > Fälligkeit oder fremdem Status. Ohne echte Änderung: kein Update, kein Log, unverändertes `updatedAt`

- [ ] **Step 1: Fehlschlagenden Test schreiben** – `tests/unit/tasks-update.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { listActivity } from "@/server/activity/service";
import { createTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

async function setup() {
  const ada = await makeActor("ada@example.com");
  const p = await makeProject(ada, "UPD");
  const task = await createTask(testDb, ada, { projectId: p.project.id, title: "Original" });
  return { ada, ...p, task };
}

describe("updateTask", () => {
  beforeEach(resetDb);

  it("updates fields, bumps updatedAt and logs a diff of the changed fields only", async () => {
    const { ada, task } = await setup();
    const updated = await updateTask(testDb, ada, task.id, task.updatedAt.toISOString(), {
      title: "Neu",
      priority: "high",
      dueDate: "2026-10-14",
      description: "",
    });
    expect(updated.title).toBe("Neu");
    expect(updated.priority).toBe("high");
    expect(updated.dueDate).toBe("2026-10-14");
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(task.updatedAt.getTime());
    const log = await listActivity(testDb, task.id);
    expect(log.at(-1)).toMatchObject({
      action: "task.updated",
      diff: { title: ["Original", "Neu"], priority: ["none", "high"], dueDate: [null, "2026-10-14"] },
    });
  });

  it("rejects a stale updatedAt with CONFLICT", async () => {
    const { ada, task } = await setup();
    const stale = task.updatedAt.toISOString();
    await updateTask(testDb, ada, task.id, stale, { title: "Erster" });
    await expect(updateTask(testDb, ada, task.id, stale, { title: "Zweiter" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("lets exactly one of two concurrent saves win", async () => {
    const { ada, task } = await setup();
    const stale = task.updatedAt.toISOString();
    const results = await Promise.allSettled([
      updateTask(testDb, ada, task.id, stale, { title: "A" }),
      updateTask(testDb, ada, task.id, stale, { title: "B" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({
      code: "CONFLICT",
    });
  });

  it("does nothing when nothing changes", async () => {
    const { ada, task } = await setup();
    const same = await updateTask(testDb, ada, task.id, task.updatedAt.toISOString(), { title: "Original" });
    expect(same.updatedAt.toISOString()).toBe(task.updatedAt.toISOString());
    expect(await listActivity(testDb, task.id)).toHaveLength(1);
  });

  it("sets and clears completedAt with done statuses", async () => {
    const { ada, task, done, open } = await setup();
    const finished = await updateTask(testDb, ada, task.id, task.updatedAt.toISOString(), { statusId: done.id });
    expect(finished.completedAt).not.toBeNull();
    const reopened = await updateTask(testDb, ada, task.id, finished.updatedAt.toISOString(), { statusId: open.id });
    expect(reopened.completedAt).toBeNull();
  });

  it("checks start ≤ due also when only one side changes", async () => {
    const { ada, task } = await setup();
    const withDue = await updateTask(testDb, ada, task.id, task.updatedAt.toISOString(), { dueDate: "2026-10-01" });
    await expect(
      updateTask(testDb, ada, task.id, withDue.updatedAt.toISOString(), { startDate: "2026-10-05" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a status from another project", async () => {
    const { ada, task } = await setup();
    const other = await makeProject(ada, "OTH");
    await expect(
      updateTask(testDb, ada, task.id, task.updatedAt.toISOString(), { statusId: other.open.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("forbids guests and hides tasks from non-members", async () => {
    const { project, task } = await setup();
    const gast = await makeActor("gast@example.com");
    const fremd = await makeActor("fremd@example.com");
    await addMember(project.id, gast, "guest");
    const stamp = task.updatedAt.toISOString();
    await expect(updateTask(testDb, gast, task.id, stamp, { title: "X" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateTask(testDb, fremd, task.id, stamp, { title: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateTask(testDb, gast, "kaputt", stamp, { title: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/unit/tasks-update.test.ts`
Expected: FAIL – `updateTask` ist kein Export (`TypeError: … is not a function`)

- [ ] **Step 3: Implementieren** – `src/server/tasks/service.ts`

Importe ergänzen: `updateTaskSchema`, `type TaskPatch` aus `@/lib/schemas/task`; `loadTaskAccess` aus `./access`. Dann anhängen:
```ts

const EDITABLE_FIELDS = ["title", "description", "statusId", "priority", "startDate", "dueDate"] as const;

export async function updateTask(
  db: DB,
  actor: Actor,
  taskId: string,
  expectedUpdatedAt: string,
  rawPatch: TaskPatch,
): Promise<Task> {
  const patch = updateTaskSchema.parse(rawPatch);

  return db.transaction(async (tx) => {
    const { task, role } = await loadTaskAccess(tx, actor, taskId);
    assertCan(actor, "task.update", projectCtx(role));
    if (task.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new DomainError("CONFLICT", "Die Aufgabe wurde zwischenzeitlich geändert.");
    }

    const changes: Partial<typeof tasks.$inferInsert> = {};
    const diff: Record<string, [unknown, unknown]> = {};
    for (const field of EDITABLE_FIELDS) {
      const next = patch[field];
      if (next !== undefined && next !== task[field]) {
        Object.assign(changes, { [field]: next });
        diff[field] = [task[field], next];
      }
    }
    if (Object.keys(diff).length === 0) return task;

    const startDate = changes.startDate !== undefined ? changes.startDate : task.startDate;
    const dueDate = changes.dueDate !== undefined ? changes.dueDate : task.dueDate;
    if (startDate && dueDate && startDate > dueDate) {
      throw new DomainError("VALIDATION", "Der Start liegt nach dem Fälligkeitsdatum.");
    }
    if (changes.statusId) {
      const status = await resolveStatus(tx, task.projectId, changes.statusId);
      changes.completedAt = status.isDone ? (task.completedAt ?? new Date()) : null;
    }

    // Optimistic lock: a concurrent writer that committed first makes this match zero rows.
    const [updated] = await tx
      .update(tasks)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(and(eq(tasks.id, taskId), eq(tasks.updatedAt, task.updatedAt)))
      .returning();
    if (!updated) throw new DomainError("CONFLICT", "Die Aufgabe wurde zwischenzeitlich geändert.");

    await recordActivity(tx, {
      projectId: task.projectId,
      taskId: task.id,
      actorId: actor.id,
      action: "task.updated",
      diff,
    });
    return updated;
  });
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run && npm run -s typecheck`
Expected: PASS – `tasks-update.test.ts` (8), alle anderen grün

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tasks): update tasks with optimistic conflict detection"
```

---

### Task 5: Labels, Zuständige, Labels an Aufgaben

**Files:**
- Create: `src/server/labels/service.ts`, `src/server/tasks/relations.ts`, `tests/unit/labels-relations.test.ts`

**Interfaces:**
- Consumes: `labelSchema` (Task 3), `requireProjectAccess`, `listMembers` (Task 3), `loadTaskAccess` (Task 3), `recordActivity` (Task 3)
- Produces:
  - `type Label`, `createLabel(db, actor, input: LabelInput): Promise<Label>` (wirft `LABEL_TAKEN`), `deleteLabel(db, actor, labelId: string): Promise<void>`, `listLabels(db, projectId: string): Promise<Label[]>`
  - `setTaskAssignees(db, actor, taskId: string, userIds: string[]): Promise<void>`, `setTaskLabels(db, actor, taskId: string, labelIds: string[]): Promise<void>`. Ersetzen die Menge, nur Projektmitglieder bzw. Projekt-Labels, loggen `{ added, removed }`, ohne Änderung kein Log

- [ ] **Step 1: Fehlschlagenden Test schreiben** – `tests/unit/labels-relations.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { listActivity } from "@/server/activity/service";
import { createLabel, deleteLabel, listLabels } from "@/server/labels/service";
import { setTaskAssignees, setTaskLabels } from "@/server/tasks/relations";
import { createTask } from "@/server/tasks/service";
import { getTaskDetail } from "@/server/tasks/queries";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

describe("labels", () => {
  beforeEach(resetDb);

  it("lets owners create, list (by name) and delete labels", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "LAB");
    await createLabel(testDb, ada, { projectId: project.id, name: " Frontend ", color: "#3b82f6" });
    const design = await createLabel(testDb, ada, { projectId: project.id, name: "Design", color: "#a855f7" });
    expect((await listLabels(testDb, project.id)).map((l) => l.name)).toEqual(["Design", "Frontend"]);
    await deleteLabel(testDb, ada, design.id);
    expect((await listLabels(testDb, project.id)).map((l) => l.name)).toEqual(["Frontend"]);
  });

  it("reports duplicates case-insensitively as LABEL_TAKEN and rejects unknown colors", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "DUP");
    await createLabel(testDb, ada, { projectId: project.id, name: "Design", color: "#3b82f6" });
    await expect(
      createLabel(testDb, ada, { projectId: project.id, name: "DESIGN", color: "#3b82f6" }),
    ).rejects.toMatchObject({ code: "LABEL_TAKEN" });
    await expect(
      createLabel(testDb, ada, { projectId: project.id, name: "X", color: "#123456" }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("allows only owners/admins to manage labels", async () => {
    const ada = await makeActor("ada@example.com");
    const mia = await makeActor("mia@example.com");
    const { project } = await makeProject(ada, "OWN");
    await addMember(project.id, mia, "member");
    await expect(
      createLabel(testDb, mia, { projectId: project.id, name: "X", color: "#3b82f6" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const label = await createLabel(testDb, ada, { projectId: project.id, name: "X", color: "#3b82f6" });
    await expect(deleteLabel(testDb, mia, label.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteLabel(testDb, mia, "kaputt")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("task relations", () => {
  beforeEach(resetDb);

  it("replaces assignees and labels and logs added/removed", async () => {
    const ada = await makeActor("ada@example.com");
    const mia = await makeActor("mia@example.com");
    const { project } = await makeProject(ada, "REL");
    await addMember(project.id, mia, "member");
    const label = await createLabel(testDb, ada, { projectId: project.id, name: "Design", color: "#3b82f6" });
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });

    await setTaskAssignees(testDb, ada, task.id, [ada.id, mia.id]);
    await setTaskAssignees(testDb, ada, task.id, [mia.id]);
    await setTaskLabels(testDb, ada, task.id, [label.id]);

    const detail = await getTaskDetail(testDb, ada, task.id);
    expect(detail?.assigneeIds).toEqual([mia.id]);
    expect(detail?.labelIds).toEqual([label.id]);
    const log = await listActivity(testDb, task.id);
    expect(log.filter((e) => e.action === "task.assigneesChanged").map((e) => e.diff)).toEqual([
      { added: [ada.id, mia.id], removed: [] },
      { added: [], removed: [ada.id] },
    ]);
  });

  it("does not log when the set is unchanged and ignores duplicate ids", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "NOP");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    await setTaskAssignees(testDb, ada, task.id, [ada.id, ada.id]);
    await setTaskAssignees(testDb, ada, task.id, [ada.id]);
    const log = await listActivity(testDb, task.id);
    expect(log.filter((e) => e.action === "task.assigneesChanged")).toHaveLength(1);
  });

  it("rejects non-members and labels from other projects", async () => {
    const ada = await makeActor("ada@example.com");
    const fremd = await makeActor("fremd@example.com");
    const a = await makeProject(ada, "PRA");
    const b = await makeProject(ada, "PRB");
    const foreignLabel = await createLabel(testDb, ada, { projectId: b.project.id, name: "B", color: "#3b82f6" });
    const task = await createTask(testDb, ada, { projectId: a.project.id, title: "T" });
    await expect(setTaskAssignees(testDb, ada, task.id, [fremd.id])).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setTaskAssignees(testDb, ada, task.id, ["kaputt"])).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setTaskLabels(testDb, ada, task.id, [foreignLabel.id])).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("forbids guests", async () => {
    const ada = await makeActor("ada@example.com");
    const gast = await makeActor("gast@example.com");
    const { project } = await makeProject(ada, "GST");
    await addMember(project.id, gast, "guest");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    await expect(setTaskAssignees(testDb, gast, task.id, [gast.id])).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
```

> Hinweis: Dieser Test nutzt bereits `getTaskDetail` aus Task 7. Bis dahin schlägt der Import fehl. Deshalb legt Step 3 eine minimale Vorab-Version von `getTaskDetail` an, die Task 7 vollständig ersetzt.

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/unit/labels-relations.test.ts`
Expected: FAIL – `Cannot find package '@/server/labels/service'`

- [ ] **Step 3: Implementieren**

`src/server/labels/service.ts`:
```ts
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { labelSchema, type LabelInput } from "@/lib/schemas/task";
import type { DB } from "@/server/db/client";
import { labels } from "@/server/db/schema";
import { DomainError, isUniqueViolation } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { requireProjectAccess } from "@/server/projects/service";

export type Label = typeof labels.$inferSelect;

export async function createLabel(db: DB, actor: Actor, raw: LabelInput): Promise<Label> {
  const input = labelSchema.parse(raw);
  const access = await requireProjectAccess(db, actor, input.projectId);
  assertCan(actor, "project.update", projectCtx(access.role));
  try {
    const [label] = await db.insert(labels).values(input).returning();
    return label;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("LABEL_TAKEN", `Das Label „${input.name}“ gibt es schon.`);
    throw err;
  }
}

export async function deleteLabel(db: DB, actor: Actor, labelId: string): Promise<void> {
  const notFound = new DomainError("NOT_FOUND", "Label nicht gefunden.");
  if (!z.uuid().safeParse(labelId).success) throw notFound;
  const [label] = await db.select().from(labels).where(eq(labels.id, labelId)).limit(1);
  if (!label) throw notFound;
  const access = await requireProjectAccess(db, actor, label.projectId);
  assertCan(actor, "project.update", projectCtx(access.role));
  await db.delete(labels).where(eq(labels.id, labelId));
}

export function listLabels(db: DB, projectId: string): Promise<Label[]> {
  return db
    .select()
    .from(labels)
    .where(eq(labels.projectId, projectId))
    .orderBy(asc(sql`lower(${labels.name})`));
}
```

`src/server/tasks/relations.ts`:
```ts
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { recordActivity, type ActivityAction } from "@/server/activity/service";
import type { DB, Executor } from "@/server/db/client";
import { labels, projectMembers, taskAssignees, taskLabels } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { loadTaskAccess } from "./access";

const idList = z.array(z.uuid()).max(50).transform((ids) => [...new Set(ids)]);

function parseIds(ids: string[], message: string): string[] {
  const parsed = idList.safeParse(ids);
  if (!parsed.success) throw new DomainError("VALIDATION", message);
  return parsed.data;
}

function diffSets(before: string[], after: string[]) {
  return {
    added: after.filter((id) => !before.includes(id)),
    removed: before.filter((id) => !after.includes(id)),
  };
}

export async function setTaskAssignees(db: DB, actor: Actor, taskId: string, userIds: string[]): Promise<void> {
  const ids = parseIds(userIds, "Ungültige Zuständige.");
  await db.transaction(async (tx) => {
    const { task, role } = await loadTaskAccess(tx, actor, taskId);
    assertCan(actor, "task.update", projectCtx(role));
    if (ids.length > 0) {
      const members = await tx
        .select({ userId: projectMembers.userId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, task.projectId), inArray(projectMembers.userId, ids)));
      if (members.length !== ids.length) throw new DomainError("VALIDATION", "Nur Projektmitglieder können zuständig sein.");
    }
    const before = (await tx.select().from(taskAssignees).where(eq(taskAssignees.taskId, task.id))).map((r) => r.userId);
    const change = diffSets(before, ids);
    if (change.added.length === 0 && change.removed.length === 0) return;
    await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, task.id));
    if (ids.length > 0) await tx.insert(taskAssignees).values(ids.map((userId) => ({ taskId: task.id, userId })));
    await log(tx, task.projectId, task.id, actor.id, "task.assigneesChanged", change);
  });
}

export async function setTaskLabels(db: DB, actor: Actor, taskId: string, labelIds: string[]): Promise<void> {
  const ids = parseIds(labelIds, "Ungültige Labels.");
  await db.transaction(async (tx) => {
    const { task, role } = await loadTaskAccess(tx, actor, taskId);
    assertCan(actor, "task.update", projectCtx(role));
    if (ids.length > 0) {
      const found = await tx
        .select({ id: labels.id })
        .from(labels)
        .where(and(eq(labels.projectId, task.projectId), inArray(labels.id, ids)));
      if (found.length !== ids.length) throw new DomainError("VALIDATION", "Unbekanntes Label.");
    }
    const before = (await tx.select().from(taskLabels).where(eq(taskLabels.taskId, task.id))).map((r) => r.labelId);
    const change = diffSets(before, ids);
    if (change.added.length === 0 && change.removed.length === 0) return;
    await tx.delete(taskLabels).where(eq(taskLabels.taskId, task.id));
    if (ids.length > 0) await tx.insert(taskLabels).values(ids.map((labelId) => ({ taskId: task.id, labelId })));
    await log(tx, task.projectId, task.id, actor.id, "task.labelsChanged", change);
  });
}

function log(
  tx: Executor,
  projectId: string,
  taskId: string,
  actorId: string,
  action: ActivityAction,
  diff: { added: string[]; removed: string[] },
) {
  return recordActivity(tx, { projectId, taskId, actorId, action, diff });
}
```

Vorab-Version `src/server/tasks/queries.ts` (wird in Task 7 vollständig ersetzt):
```ts
import { eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { taskAssignees, taskLabels } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import type { Actor } from "@/server/permissions";
import { loadTaskAccess } from "./access";

export async function getTaskDetail(db: DB, actor: Actor, taskId: string) {
  try {
    const { task } = await loadTaskAccess(db, actor, taskId);
    const assigneeIds = (await db.select().from(taskAssignees).where(eq(taskAssignees.taskId, task.id))).map((r) => r.userId);
    const labelIds = (await db.select().from(taskLabels).where(eq(taskLabels.taskId, task.id))).map((r) => r.labelId);
    return { id: task.id, assigneeIds, labelIds };
  } catch (err) {
    if (err instanceof DomainError && err.code === "NOT_FOUND") return null;
    throw err;
  }
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run && npm run -s typecheck`
Expected: PASS – `labels-relations.test.ts` (7), alle anderen grün

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tasks): add project labels, assignees and task labels"
```

---

### Task 6: Checklisten

**Files:**
- Create: `src/server/checklists/service.ts`, `tests/unit/checklists.test.ts`

**Interfaces:**
- Consumes: `loadTaskAccess` (Task 3), `checklistTextSchema` (Task 3), `byPosition` (M1)
- Produces: `type ChecklistItem`, `addChecklistItem(db, actor, taskId: string, text: string): Promise<ChecklistItem>`, `setChecklistItemDone(db, actor, itemId: string, done: boolean): Promise<void>`, `deleteChecklistItem(db, actor, itemId: string): Promise<void>`, `listChecklist(db, taskId: string): Promise<ChecklistItem[]>`

- [ ] **Step 1: Fehlschlagenden Test schreiben** – `tests/unit/checklists.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  addChecklistItem,
  deleteChecklistItem,
  listChecklist,
  setChecklistItemDone,
} from "@/server/checklists/service";
import { createTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

describe("checklists", () => {
  beforeEach(resetDb);

  it("adds items in order, toggles and deletes them", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "CHK");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    const a = await addChecklistItem(testDb, ada, task.id, " Logo ");
    await addChecklistItem(testDb, ada, task.id, "Farben");
    await setChecklistItemDone(testDb, ada, a.id, true);
    expect((await listChecklist(testDb, task.id)).map((i) => [i.text, i.done])).toEqual([
      ["Logo", true],
      ["Farben", false],
    ]);
    await deleteChecklistItem(testDb, ada, a.id);
    expect((await listChecklist(testDb, task.id)).map((i) => i.text)).toEqual(["Farben"]);
  });

  it("validates text and ids", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "VAL");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    await expect(addChecklistItem(testDb, ada, task.id, "  ")).rejects.toBeInstanceOf(ZodError);
    await expect(setChecklistItemDone(testDb, ada, "kaputt", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("forbids guests and hides items from non-members", async () => {
    const ada = await makeActor("ada@example.com");
    const gast = await makeActor("gast@example.com");
    const fremd = await makeActor("fremd@example.com");
    const { project } = await makeProject(ada, "GST");
    await addMember(project.id, gast, "guest");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    const item = await addChecklistItem(testDb, ada, task.id, "Punkt");
    await expect(addChecklistItem(testDb, gast, task.id, "X")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setChecklistItemDone(testDb, gast, item.id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteChecklistItem(testDb, fremd, item.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/unit/checklists.test.ts`
Expected: FAIL – `Cannot find package '@/server/checklists/service'`

- [ ] **Step 3: Implementieren** – `src/server/checklists/service.ts`

```ts
import { desc, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";
import { checklistTextSchema } from "@/lib/schemas/task";
import type { DB } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { checklistItems } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { loadTaskAccess } from "@/server/tasks/access";

export type ChecklistItem = typeof checklistItems.$inferSelect;

async function requireEditableTask(db: DB, actor: Actor, taskId: string) {
  const { task, role } = await loadTaskAccess(db, actor, taskId);
  assertCan(actor, "task.update", projectCtx(role));
  return task;
}

async function requireEditableItem(db: DB, actor: Actor, itemId: string): Promise<ChecklistItem> {
  const notFound = new DomainError("NOT_FOUND", "Checklisten-Punkt nicht gefunden.");
  if (!z.uuid().safeParse(itemId).success) throw notFound;
  const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId)).limit(1);
  if (!item) throw notFound;
  await requireEditableTask(db, actor, item.taskId);
  return item;
}

export async function addChecklistItem(db: DB, actor: Actor, taskId: string, rawText: string): Promise<ChecklistItem> {
  const text = checklistTextSchema.parse(rawText);
  const task = await requireEditableTask(db, actor, taskId);
  const [last] = await db
    .select({ position: checklistItems.position })
    .from(checklistItems)
    .where(eq(checklistItems.taskId, task.id))
    .orderBy(desc(byPosition(checklistItems.position)))
    .limit(1);
  const [item] = await db
    .insert(checklistItems)
    .values({ taskId: task.id, text, position: generateKeyBetween(last?.position ?? null, null) })
    .returning();
  return item;
}

export async function setChecklistItemDone(db: DB, actor: Actor, itemId: string, done: boolean): Promise<void> {
  const item = await requireEditableItem(db, actor, itemId);
  await db.update(checklistItems).set({ done }).where(eq(checklistItems.id, item.id));
}

export async function deleteChecklistItem(db: DB, actor: Actor, itemId: string): Promise<void> {
  const item = await requireEditableItem(db, actor, itemId);
  await db.delete(checklistItems).where(eq(checklistItems.id, item.id));
}

export function listChecklist(db: DB, taskId: string): Promise<ChecklistItem[]> {
  return db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.taskId, taskId))
    .orderBy(byPosition(checklistItems.position));
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run && npm run -s typecheck`
Expected: PASS – `checklists.test.ts` (3), alle anderen grün

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tasks): add task checklists"
```

---

### Task 7: Abfragen für Liste und Detail

**Files:**
- Modify (ersetzen): `src/server/tasks/queries.ts`
- Create: `tests/unit/task-queries.test.ts`

**Interfaces:**
- Consumes: `TaskListFilters`, `TaskSort` (Task 1), Tabellen (Task 2), `loadTaskAccess` (Task 3), `listMembers` (Task 3), `listLabels` (Task 5), `listChecklist` (Task 6), `listStatuses` (M1), `can`, `projectCtx`
- Produces:
  - `type TaskListRow = { id: string; number: number; key: string; title: string; priority: TaskPriority; startDate: string | null; dueDate: string | null; status: { id: string; name: string; color: string; isDone: boolean }; assignees: { id: string; name: string }[]; labels: { id: string; name: string; color: string }[]; subtasks: { done: number; total: number }; checklist: { done: number; total: number } }`
  - `listProjectTasks(db: DB, projectId: string, filters?: TaskListFilters, sort?: TaskSort): Promise<TaskListRow[]>` – nur Aufgaben ohne Parent
  - `type TaskDetail = { id; projectId; projectName; key; number; title; description; priority; startDate; dueDate; statusId; updatedAt: string; canEdit: boolean; parent: { id: string; number: number; title: string } | null; statuses: { id; name; color; isDone }[]; members: { id: string; name: string }[]; labels: { id; name; color }[]; assigneeIds: string[]; labelIds: string[]; subtasks: { id: string; number: number; title: string; isDone: boolean }[]; checklist: { id: string; text: string; done: boolean }[]; hintAllSubtasksDone: boolean }`
  - `getTaskDetail(db: DB, actor: Actor, taskId: string): Promise<TaskDetail | null>` (null = nicht gefunden/kein Zugriff)

- [ ] **Step 1: Fehlschlagenden Test schreiben** – `tests/unit/task-queries.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { addChecklistItem, setChecklistItemDone } from "@/server/checklists/service";
import { createLabel } from "@/server/labels/service";
import { getTaskDetail, listProjectTasks } from "@/server/tasks/queries";
import { setTaskAssignees, setTaskLabels } from "@/server/tasks/relations";
import { createTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

async function setup() {
  const ada = await makeActor("ada@example.com");
  const mia = await makeActor("mia@example.com");
  const p = await makeProject(ada, "QRY");
  await addMember(p.project.id, mia, "member");
  const design = await createLabel(testDb, ada, { projectId: p.project.id, name: "Design", color: "#a855f7" });
  const logo = await createTask(testDb, ada, { projectId: p.project.id, title: "Logo 100% fertig" });
  const header = await createTask(testDb, ada, { projectId: p.project.id, title: "Header_bauen" });
  const footer = await createTask(testDb, ada, { projectId: p.project.id, title: "Footer" });
  const sub = await createTask(testDb, ada, { projectId: p.project.id, title: "Unter", parentId: logo.id });
  await updateTask(testDb, ada, sub.id, sub.updatedAt.toISOString(), { statusId: p.done.id });
  await createTask(testDb, ada, { projectId: p.project.id, title: "Unter 2", parentId: logo.id });
  await setTaskAssignees(testDb, ada, header.id, [mia.id]);
  await setTaskLabels(testDb, ada, logo.id, [design.id]);
  const item = await addChecklistItem(testDb, ada, logo.id, "A");
  await addChecklistItem(testDb, ada, logo.id, "B");
  await setChecklistItemDone(testDb, ada, item.id, true);
  const h = await updateTask(testDb, ada, header.id, header.updatedAt.toISOString(), { priority: "urgent", dueDate: "2026-10-01" });
  await updateTask(testDb, ada, footer.id, footer.updatedAt.toISOString(), { priority: "low", dueDate: "2026-09-01" });
  return { ada, mia, ...p, design, logo, header: h, footer, sub };
}

describe("listProjectTasks", () => {
  beforeEach(resetDb);

  it("lists top-level tasks with status, assignees, labels and progress", async () => {
    const { project, mia } = await setup();
    const rows = await listProjectTasks(testDb, project.id);
    expect(rows.map((r) => r.title)).toEqual(["Logo 100% fertig", "Header_bauen", "Footer"]);
    const [logo, header] = rows;
    expect(logo.key).toBe("QRY");
    expect(logo.subtasks).toEqual({ done: 1, total: 2 });
    expect(logo.checklist).toEqual({ done: 1, total: 2 });
    expect(logo.labels.map((l) => l.name)).toEqual(["Design"]);
    expect(header.assignees).toEqual([{ id: mia.id, name: "mia" }]);
    expect(header.status.name).toBe("Offen");
  });

  it("filters by assignee, label, priority and status", async () => {
    const { project, mia, design, done } = await setup();
    const titles = async (f: Parameters<typeof listProjectTasks>[2]) =>
      (await listProjectTasks(testDb, project.id, f)).map((r) => r.title);
    expect(await titles({ assigneeId: mia.id })).toEqual(["Header_bauen"]);
    expect(await titles({ labelId: design.id })).toEqual(["Logo 100% fertig"]);
    expect(await titles({ priority: "low" })).toEqual(["Footer"]);
    expect(await titles({ statusId: done.id })).toEqual([]);
  });

  it("searches literally and by number", async () => {
    const { project } = await setup();
    const titles = async (q: string) => (await listProjectTasks(testDb, project.id, { q })).map((r) => r.title);
    expect(await titles("100%")).toEqual(["Logo 100% fertig"]);
    expect(await titles("_")).toEqual(["Header_bauen"]);
    expect(await titles("\\")).toEqual([]);
    expect(await titles("QRY-2")).toEqual(["Header_bauen"]);
    expect(await titles("3")).toEqual(["Footer"]);
  });

  it("sorts by priority and due date (empty dates last)", async () => {
    const { project } = await setup();
    const titles = async (field: "priority" | "dueDate", dir: "asc" | "desc") =>
      (await listProjectTasks(testDb, project.id, {}, { field, dir })).map((r) => r.title);
    expect(await titles("priority", "desc")).toEqual(["Header_bauen", "Footer", "Logo 100% fertig"]);
    expect(await titles("dueDate", "asc")).toEqual(["Footer", "Header_bauen", "Logo 100% fertig"]);
    expect(await titles("dueDate", "desc")).toEqual(["Header_bauen", "Footer", "Logo 100% fertig"]);
  });
});

describe("getTaskDetail", () => {
  beforeEach(resetDb);

  it("returns everything the editor needs", async () => {
    const { ada, logo, design, project } = await setup();
    const detail = await getTaskDetail(testDb, ada, logo.id);
    expect(detail).toMatchObject({
      id: logo.id,
      key: "QRY",
      number: 1,
      projectName: project.name,
      canEdit: true,
      parent: null,
      labelIds: [design.id],
      hintAllSubtasksDone: false,
    });
    expect(detail?.subtasks.map((s) => [s.title, s.isDone])).toEqual([
      ["Unter", true],
      ["Unter 2", false],
    ]);
    expect(detail?.checklist.map((c) => c.text)).toEqual(["A", "B"]);
    expect(detail?.statuses).toHaveLength(4);
    expect(detail?.members.map((m) => m.name)).toEqual(["ada", "mia"]);
    expect(typeof detail?.updatedAt).toBe("string");
  });

  it("shows the parent for subtasks and the done hint once all subtasks are done", async () => {
    const { ada, logo, sub, done } = await setup();
    const subDetail = await getTaskDetail(testDb, ada, sub.id);
    expect(subDetail?.parent).toMatchObject({ id: logo.id, number: 1 });
    const second = (await getTaskDetail(testDb, ada, logo.id))!.subtasks[1];
    const secondTask = await getTaskDetail(testDb, ada, second.id);
    await updateTask(testDb, ada, second.id, secondTask!.updatedAt, { statusId: done.id });
    expect((await getTaskDetail(testDb, ada, logo.id))?.hintAllSubtasksDone).toBe(true);
  });

  it("is read-only for guests and null for outsiders or bad ids", async () => {
    const { project, logo } = await setup();
    const gast = await makeActor("gast@example.com");
    const fremd = await makeActor("fremd@example.com");
    await addMember(project.id, gast, "guest");
    expect((await getTaskDetail(testDb, gast, logo.id))?.canEdit).toBe(false);
    expect(await getTaskDetail(testDb, fremd, logo.id)).toBeNull();
    expect(await getTaskDetail(testDb, gast, "kaputt")).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/unit/task-queries.test.ts`
Expected: FAIL – `listProjectTasks` ist kein Export (`TypeError: … is not a function`)

- [ ] **Step 3: Implementieren** – `src/server/tasks/queries.ts` vollständig ersetzen

```ts
import { and, asc, desc, eq, exists, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { TaskPriority } from "@/lib/enums";
import type { TaskListFilters, TaskSort } from "@/lib/task-list-params";
import { listChecklist } from "@/server/checklists/service";
import type { DB } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import {
  checklistItems,
  labels,
  projects,
  statuses,
  taskAssignees,
  taskLabels,
  tasks,
  users,
} from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { listLabels } from "@/server/labels/service";
import { can, projectCtx, type Actor } from "@/server/permissions";
import { listMembers, listStatuses } from "@/server/projects/service";
import { loadTaskAccess } from "./access";

export type TaskListRow = {
  id: string;
  number: number;
  key: string;
  title: string;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  status: { id: string; name: string; color: string; isDone: boolean };
  assignees: { id: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
  subtasks: { done: number; total: number };
  checklist: { done: number; total: number };
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** "QRY-12" or "12" → 12 */
function parseTaskNumber(q: string): number | undefined {
  const match = /^(?:[a-z][a-z0-9]*-)?(\d{1,9})$/i.exec(q);
  return match ? Number(match[1]) : undefined;
}

function orderFor(sort: TaskSort): SQL[] {
  const dir = sort.dir === "desc" ? desc : asc;
  switch (sort.field) {
    case "title":
      return [dir(sql`lower(${tasks.title})`), asc(tasks.number)];
    case "status":
      return [dir(byPosition(statuses.position)), asc(tasks.number)];
    case "priority":
      return [dir(tasks.priority), asc(tasks.number)];
    case "dueDate":
      return [sql`${tasks.dueDate} ${sql.raw(sort.dir === "desc" ? "desc" : "asc")} nulls last`, asc(tasks.number)];
    default:
      return [dir(tasks.number)];
  }
}

export async function listProjectTasks(
  db: DB,
  projectId: string,
  filters: TaskListFilters = {},
  sort: TaskSort = { field: "number", dir: "asc" },
): Promise<TaskListRow[]> {
  const conditions: (SQL | undefined)[] = [eq(tasks.projectId, projectId), isNull(tasks.parentId)];
  if (filters.statusId) conditions.push(eq(tasks.statusId, filters.statusId));
  if (filters.priority) conditions.push(eq(tasks.priority, filters.priority));
  if (filters.assigneeId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(taskAssignees)
          .where(and(eq(taskAssignees.taskId, tasks.id), eq(taskAssignees.userId, filters.assigneeId))),
      ),
    );
  }
  if (filters.labelId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(taskLabels)
          .where(and(eq(taskLabels.taskId, tasks.id), eq(taskLabels.labelId, filters.labelId))),
      ),
    );
  }
  if (filters.q) {
    const number = parseTaskNumber(filters.q);
    conditions.push(
      or(ilike(tasks.title, `%${escapeLike(filters.q)}%`), number !== undefined ? eq(tasks.number, number) : undefined),
    );
  }

  const base = await db
    .select({
      id: tasks.id,
      number: tasks.number,
      key: projects.key,
      title: tasks.title,
      priority: tasks.priority,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      status: { id: statuses.id, name: statuses.name, color: statuses.color, isDone: statuses.isDone },
    })
    .from(tasks)
    .innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(...conditions))
    .orderBy(...orderFor(sort));
  if (base.length === 0) return [];

  const ids = base.map((t) => t.id);
  const [assigneeRows, labelRows, subtaskRows, checklistRows] = await Promise.all([
    db
      .select({ taskId: taskAssignees.taskId, id: users.id, name: users.name })
      .from(taskAssignees)
      .innerJoin(users, eq(users.id, taskAssignees.userId))
      .where(inArray(taskAssignees.taskId, ids))
      .orderBy(asc(users.name)),
    db
      .select({ taskId: taskLabels.taskId, id: labels.id, name: labels.name, color: labels.color })
      .from(taskLabels)
      .innerJoin(labels, eq(labels.id, taskLabels.labelId))
      .where(inArray(taskLabels.taskId, ids))
      .orderBy(asc(sql`lower(${labels.name})`)),
    db
      .select({
        parentId: tasks.parentId,
        total: sql<number>`count(*)`.mapWith(Number),
        done: sql<number>`count(*) filter (where ${statuses.isDone})`.mapWith(Number),
      })
      .from(tasks)
      .innerJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(inArray(tasks.parentId, ids))
      .groupBy(tasks.parentId),
    db
      .select({
        taskId: checklistItems.taskId,
        total: sql<number>`count(*)`.mapWith(Number),
        done: sql<number>`count(*) filter (where ${checklistItems.done})`.mapWith(Number),
      })
      .from(checklistItems)
      .where(inArray(checklistItems.taskId, ids))
      .groupBy(checklistItems.taskId),
  ]);

  return base.map((t) => {
    const sub = subtaskRows.find((r) => r.parentId === t.id);
    const check = checklistRows.find((r) => r.taskId === t.id);
    return {
      ...t,
      assignees: assigneeRows.filter((r) => r.taskId === t.id).map(({ id, name }) => ({ id, name })),
      labels: labelRows.filter((r) => r.taskId === t.id).map(({ id, name, color }) => ({ id, name, color })),
      subtasks: { done: sub?.done ?? 0, total: sub?.total ?? 0 },
      checklist: { done: check?.done ?? 0, total: check?.total ?? 0 },
    };
  });
}

export type TaskDetail = {
  id: string;
  projectId: string;
  projectName: string;
  key: string;
  number: number;
  title: string;
  description: string;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  statusId: string;
  updatedAt: string;
  canEdit: boolean;
  parent: { id: string; number: number; title: string } | null;
  statuses: { id: string; name: string; color: string; isDone: boolean }[];
  members: { id: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
  assigneeIds: string[];
  labelIds: string[];
  subtasks: { id: string; number: number; title: string; isDone: boolean }[];
  checklist: { id: string; text: string; done: boolean }[];
  hintAllSubtasksDone: boolean;
};

export async function getTaskDetail(db: DB, actor: Actor, taskId: string): Promise<TaskDetail | null> {
  let access;
  try {
    access = await loadTaskAccess(db, actor, taskId);
  } catch (err) {
    if (err instanceof DomainError && err.code === "NOT_FOUND") return null;
    throw err;
  }
  const { task, role } = access;

  const [[project], statusList, members, projectLabels, assignees, taskLabelRows, subtasks, checklist, parentRows] =
    await Promise.all([
      db.select({ name: projects.name, key: projects.key }).from(projects).where(eq(projects.id, task.projectId)),
      listStatuses(db, task.projectId),
      listMembers(db, task.projectId),
      listLabels(db, task.projectId),
      db.select({ userId: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, task.id)),
      db.select({ labelId: taskLabels.labelId }).from(taskLabels).where(eq(taskLabels.taskId, task.id)),
      db
        .select({ id: tasks.id, number: tasks.number, title: tasks.title, isDone: statuses.isDone })
        .from(tasks)
        .innerJoin(statuses, eq(statuses.id, tasks.statusId))
        .where(eq(tasks.parentId, task.id))
        .orderBy(asc(tasks.number)),
      listChecklist(db, task.id),
      task.parentId
        ? db.select({ id: tasks.id, number: tasks.number, title: tasks.title }).from(tasks).where(eq(tasks.id, task.parentId))
        : Promise.resolve([]),
    ]);

  const currentStatus = statusList.find((s) => s.id === task.statusId);
  return {
    id: task.id,
    projectId: task.projectId,
    projectName: project.name,
    key: project.key,
    number: task.number,
    title: task.title,
    description: task.description,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    statusId: task.statusId,
    updatedAt: task.updatedAt.toISOString(),
    canEdit: can(actor, "task.update", projectCtx(role)),
    parent: parentRows[0] ?? null,
    statuses: statusList.map(({ id, name, color, isDone }) => ({ id, name, color, isDone })),
    members: members.map(({ id, name }) => ({ id, name })),
    labels: projectLabels.map(({ id, name, color }) => ({ id, name, color })),
    assigneeIds: assignees.map((a) => a.userId),
    labelIds: taskLabelRows.map((l) => l.labelId),
    subtasks,
    checklist: checklist.map(({ id, text, done }) => ({ id, text, done })),
    hintAllSubtasksDone: subtasks.length > 0 && subtasks.every((s) => s.isDone) && !currentStatus?.isDone,
  };
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run && npm run -s typecheck`
Expected: PASS – `task-queries.test.ts` (7) und `labels-relations.test.ts` weiterhin grün (nutzt jetzt die vollständige `getTaskDetail`)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tasks): add list and detail queries with filters, search and sorting"
```

---

### Task 8: Server Actions für Aufgaben, Checklisten und Labels

**Files:**
- Create: `src/app/(app)/tasks/actions.ts`
- Modify: `src/app/(app)/projects/actions.ts`

**Interfaces:**
- Consumes: Services aus Tasks 3–6, `runAction`, `requireActor` (M1)
- Produces (alle `"use server"`, Rückgabe `ActionResult`):
  - `createTaskAction(input: CreateTaskInput): Promise<ActionResult<{ id: string; number: number }>>`
  - `updateTaskAction(taskId: string, expectedUpdatedAt: string, patch: TaskPatch): Promise<ActionResult<{ updatedAt: string }>>`
  - `setAssigneesAction(taskId: string, userIds: string[]): Promise<ActionResult<void>>`
  - `setLabelsAction(taskId: string, labelIds: string[]): Promise<ActionResult<void>>`
  - `addChecklistItemAction(taskId: string, text: string): Promise<ActionResult<void>>`
  - `toggleChecklistItemAction(itemId: string, done: boolean): Promise<ActionResult<void>>`
  - `deleteChecklistItemAction(itemId: string): Promise<ActionResult<void>>`
  - `createLabelAction(input: LabelInput): Promise<ActionResult<void>>`, `deleteLabelAction(labelId: string): Promise<ActionResult<void>>`

Actions sind dünne Hüllen ohne eigene Logik. Getestet werden sie über die E2E-Tests in Task 11; die Logik dahinter ist durch Tasks 3–7 abgedeckt.

- [ ] **Step 1: Task-Actions anlegen** – `src/app/(app)/tasks/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { CreateTaskInput, TaskPatch } from "@/lib/schemas/task";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { addChecklistItem, deleteChecklistItem, setChecklistItemDone } from "@/server/checklists/service";
import { db } from "@/server/db/client";
import { setTaskAssignees, setTaskLabels } from "@/server/tasks/relations";
import { createTask, updateTask } from "@/server/tasks/service";

/** Every task mutation re-renders board, list, panel and task page in the same round trip. */
function refresh() {
  revalidatePath("/", "layout");
}

export async function createTaskAction(input: CreateTaskInput): Promise<ActionResult<{ id: string; number: number }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const task = await createTask(db(), actor, input);
    refresh();
    return { id: task.id, number: task.number };
  });
}

export async function updateTaskAction(
  taskId: string,
  expectedUpdatedAt: string,
  patch: TaskPatch,
): Promise<ActionResult<{ updatedAt: string }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const task = await updateTask(db(), actor, taskId, expectedUpdatedAt, patch);
    refresh();
    return { updatedAt: task.updatedAt.toISOString() };
  });
}

export async function setAssigneesAction(taskId: string, userIds: string[]): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await setTaskAssignees(db(), actor, taskId, userIds);
    refresh();
  });
}

export async function setLabelsAction(taskId: string, labelIds: string[]): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await setTaskLabels(db(), actor, taskId, labelIds);
    refresh();
  });
}

export async function addChecklistItemAction(taskId: string, text: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await addChecklistItem(db(), actor, taskId, text);
    refresh();
  });
}

export async function toggleChecklistItemAction(itemId: string, done: boolean): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await setChecklistItemDone(db(), actor, itemId, done);
    refresh();
  });
}

export async function deleteChecklistItemAction(itemId: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await deleteChecklistItem(db(), actor, itemId);
    refresh();
  });
}
```

- [ ] **Step 2: Label-Actions ergänzen** – `src/app/(app)/projects/actions.ts`

Importe ergänzen:
```ts
import type { LabelInput } from "@/lib/schemas/task";
import { createLabel, deleteLabel } from "@/server/labels/service";
```
Am Ende anhängen:
```ts

export async function createLabelAction(input: LabelInput): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await createLabel(db(), actor, input);
    revalidatePath("/", "layout");
  });
}

export async function deleteLabelAction(labelId: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await deleteLabel(db(), actor, labelId);
    revalidatePath("/", "layout");
  });
}
```

- [ ] **Step 3: Statisch prüfen**

Run: `npm run -s typecheck && npm run -s lint && npx vitest run`
Expected: keine Fehler, alle Unit-Tests grün

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(tasks): add server actions for tasks, checklists and labels"
```

---

### Task 9: Liste, Schnell-Eingabe, Filter, Board-Karten, Label-Verwaltung

**Files:**
- Create: `src/components/tasks/quick-add.tsx`, `src/components/tasks/task-filters.tsx`, `src/components/tasks/task-table.tsx`, `src/components/tasks/task-badges.tsx`, `src/components/projects/label-manager.tsx`
- Modify: `src/app/(app)/projects/[id]/list/page.tsx`, `src/app/(app)/projects/[id]/board/page.tsx`, `src/app/(app)/projects/[id]/settings/page.tsx`

**Interfaces:**
- Consumes: `listProjectTasks`, `TaskListRow` (Task 7), `listLabels` (Task 5), `listMembers` (Task 3), `listStatuses` (M1), `parseTaskListParams`, `buildHref`, `normalizeSearchParams`, `formatDate`, `isOverdue`, `PRIORITY_LABELS`, `LABEL_COLORS` (Task 1), `createTaskAction`, `createLabelAction`, `deleteLabelAction` (Task 8), `loadProject` (M1), `can`, `projectCtx`
- Produces:
  - `<QuickAdd projectId parentId? label placeholder />`
  - `<TaskFilters statuses members labels filters />`
  - `<TaskTable rows sort basePath params />`
  - `<PriorityBadge priority />`, `<LabelChips labels />`, `<DueDate date isDone />`
  - `<LabelManager projectId labels canManage />`
  - Die Seiten nehmen `searchParams` entgegen und reichen `params.task` an das Panel weiter. Das Panel selbst kommt in Task 10; bis dahin wird `params.task` ignoriert

Feste UI-Bezeichner (E2E in Task 11 verlässt sich darauf):
- Schnell-Eingabe: `aria-label="Neue Aufgabe"`
- Tabelle: `aria-label="Aufgaben"`
- Filter-Selects mit den Labels „Status“, „Zuständig“, „Label“, „Priorität“; Suche `aria-label="Suche"`
- Label-Verwaltung: Feld „Label-Name“, Select „Farbe“, Button „Label hinzufügen“, Lösch-Button `aria-label="Label <Name> löschen"`

- [ ] **Step 1: Kleine Anzeige-Bausteine** – `src/components/tasks/task-badges.tsx`

```tsx
import { formatDate, isOverdue } from "@/lib/dates";
import type { TaskPriority } from "@/lib/enums";
import { PRIORITY_LABELS } from "@/lib/priority";
import { cn } from "@/lib/utils";

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  none: "text-muted-foreground",
  low: "text-sky-600 dark:text-sky-400",
  med: "text-amber-600 dark:text-amber-400",
  high: "text-orange-600 dark:text-orange-400",
  urgent: "text-red-600 dark:text-red-400 font-medium",
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (priority === "none") return <span className="text-muted-foreground">–</span>;
  return <span className={cn("text-xs", PRIORITY_STYLE[priority])}>{PRIORITY_LABELS[priority]}</span>;
}

export function LabelChips({ labels }: { labels: { id: string; name: string; color: string }[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span key={l.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
          <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
          {l.name}
        </span>
      ))}
    </span>
  );
}

export function DueDate({ date, isDone }: { date: string | null; isDone: boolean }) {
  if (!date) return <span className="text-muted-foreground">–</span>;
  const overdue = isOverdue(date, isDone);
  return (
    <span className={cn("text-xs", overdue && "font-medium text-destructive")}>
      {formatDate(date)}
      {overdue && <span className="sr-only"> (überfällig)</span>}
    </span>
  );
}
```

- [ ] **Step 2: Schnell-Eingabe** – `src/components/tasks/quick-add.tsx`

```tsx
"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTaskAction } from "@/app/(app)/tasks/actions";
import { Input } from "@/components/ui/input";

export function QuickAdd(props: { projectId: string; parentId?: string; label: string; placeholder: string }) {
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    if (!value || pending) return;
    startTransition(async () => {
      const res = await createTaskAction({ projectId: props.projectId, parentId: props.parentId, title: value });
      if (!res.ok) {
        toast.error(res.error.fieldErrors?.title?.[0] ?? res.error.message);
        return;
      }
      setTitle("");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <Plus className="size-4 text-muted-foreground" aria-hidden />
      <Input
        aria-label={props.label}
        placeholder={props.placeholder}
        value={title}
        maxLength={200}
        readOnly={pending}
        onChange={(e) => setTitle(e.target.value)}
      />
    </form>
  );
}
```

- [ ] **Step 3: Filterleiste** – `src/components/tasks/task-filters.tsx`

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { TASK_PRIORITIES } from "@/lib/enums";
import { PRIORITY_LABELS } from "@/lib/priority";
import type { TaskListFilters } from "@/lib/task-list-params";
import { buildHref, normalizeSearchParams } from "@/lib/urls";

type Option = { id: string; name: string };

const selectClass = "h-8 rounded-md border bg-background px-2 text-sm";

export function TaskFilters(props: {
  statuses: Option[];
  members: Option[];
  labels: Option[];
  filters: TaskListFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(props.filters.q ?? "");

  function apply(key: string, value: string) {
    const params = normalizeSearchParams(Object.fromEntries(searchParams.entries()));
    router.replace(buildHref(pathname, params, { [key]: value || null }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect id="f-status" label="Status" value={props.filters.statusId} options={props.statuses} onChange={(v) => apply("status", v)} />
      <FilterSelect id="f-assignee" label="Zuständig" value={props.filters.assigneeId} options={props.members} onChange={(v) => apply("assignee", v)} />
      <FilterSelect id="f-label" label="Label" value={props.filters.labelId} options={props.labels} onChange={(v) => apply("label", v)} />
      <FilterSelect
        id="f-priority"
        label="Priorität"
        value={props.filters.priority}
        options={TASK_PRIORITIES.map((p) => ({ id: p, name: PRIORITY_LABELS[p] }))}
        onChange={(v) => apply("priority", v)}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply("q", q.trim());
        }}
      >
        <Input aria-label="Suche" placeholder="Suchen… (Enter)" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-48" />
      </form>
    </div>
  );
}

function FilterSelect(props: { id: string; label: string; value?: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    // Label is a sibling, not a wrapper: a wrapping <label> would add the selected option to the accessible name.
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <label htmlFor={props.id}>{props.label}</label>
      <select id={props.id} className={selectClass} value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">Alle</option>
        {props.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 4: Tabelle** – `src/components/tasks/task-table.tsx`

```tsx
import Link from "next/link";
import type { TaskSort, TaskSortField } from "@/lib/task-list-params";
import { buildHref, type SearchParams } from "@/lib/urls";
import type { TaskListRow } from "@/server/tasks/queries";
import { DueDate, LabelChips, PriorityBadge } from "./task-badges";

const COLUMNS: { field?: TaskSortField; label: string }[] = [
  { field: "number", label: "Nr." },
  { field: "title", label: "Titel" },
  { field: "status", label: "Status" },
  { field: "priority", label: "Priorität" },
  { label: "Zuständig" },
  { label: "Labels" },
  { field: "dueDate", label: "Fällig" },
  { label: "Fortschritt" },
];

export function TaskTable(props: { rows: TaskListRow[]; sort: TaskSort; basePath: string; params: SearchParams }) {
  const sortHref = (field: TaskSortField) => {
    const dir = props.sort.field === field && props.sort.dir === "asc" ? "desc" : "asc";
    return buildHref(props.basePath, props.params, { sort: field, dir });
  };
  return (
    <table aria-label="Aufgaben" className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          {COLUMNS.map((col) => (
            <th
              key={col.label}
              className="px-2 py-2 font-medium"
              aria-sort={
                col.field && props.sort.field === col.field ? (props.sort.dir === "asc" ? "ascending" : "descending") : undefined
              }
            >
              {col.field ? <Link href={sortHref(col.field)}>{col.label}</Link> : col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={row.id} className="border-b hover:bg-muted/40">
            <td className="px-2 py-2 text-xs whitespace-nowrap text-muted-foreground">
              {row.key}-{row.number}
            </td>
            <td className="px-2 py-2">
              <Link href={buildHref(props.basePath, props.params, { task: row.id })} className="hover:underline">
                {row.title}
              </Link>
            </td>
            <td className="px-2 py-2 whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="size-2 rounded-full" style={{ backgroundColor: row.status.color }} />
                {row.status.name}
              </span>
            </td>
            <td className="px-2 py-2">
              <PriorityBadge priority={row.priority} />
            </td>
            <td className="px-2 py-2 text-xs">{row.assignees.map((a) => a.name).join(", ") || "–"}</td>
            <td className="px-2 py-2">
              <LabelChips labels={row.labels} />
            </td>
            <td className="px-2 py-2 whitespace-nowrap">
              <DueDate date={row.dueDate} isDone={row.status.isDone} />
            </td>
            <td className="px-2 py-2 text-xs whitespace-nowrap text-muted-foreground">
              {row.subtasks.total > 0 && <span title="Unteraufgaben">▣ {row.subtasks.done}/{row.subtasks.total} </span>}
              {row.checklist.total > 0 && <span title="Checkliste">☑ {row.checklist.done}/{row.checklist.total}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Listen-Seite** – `src/app/(app)/projects/[id]/list/page.tsx` ersetzen

```tsx
import { EmptyState } from "@/components/shell/empty-state";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskFilters } from "@/components/tasks/task-filters";
import { TaskTable } from "@/components/tasks/task-table";
import { parseTaskListParams } from "@/lib/task-list-params";
import { normalizeSearchParams } from "@/lib/urls";
import { db } from "@/server/db/client";
import { listLabels } from "@/server/labels/service";
import { can, projectCtx } from "@/server/permissions";
import { loadProject } from "@/server/projects/loaders";
import { listMembers, listStatuses } from "@/server/projects/service";
import { listProjectTasks } from "@/server/tasks/queries";

export default async function ListPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const params = normalizeSearchParams(await props.searchParams);
  const { actor, project, role } = await loadProject(id);
  const { filters, sort } = parseTaskListParams(params);
  const [rows, statuses, members, labels] = await Promise.all([
    listProjectTasks(db(), project.id, filters, sort),
    listStatuses(db(), project.id),
    listMembers(db(), project.id),
    listLabels(db(), project.id),
  ]);
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="space-y-4">
      {can(actor, "task.create", projectCtx(role)) && (
        <QuickAdd projectId={project.id} label="Neue Aufgabe" placeholder="Neue Aufgabe… (Enter)" />
      )}
      <TaskFilters statuses={statuses} members={members} labels={labels} filters={filters} />
      {rows.length === 0 ? (
        <EmptyState
          title={hasFilters ? "Keine Treffer" : "Noch keine Aufgaben"}
          text={hasFilters ? "Kein Eintrag passt zu den Filtern." : "Lege oben die erste Aufgabe an."}
        />
      ) : (
        <TaskTable rows={rows} sort={sort} basePath={`/projects/${project.id}/list`} params={params} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Board mit lesenden Karten** – `src/app/(app)/projects/[id]/board/page.tsx` ersetzen

```tsx
import Link from "next/link";
import { DueDate } from "@/components/tasks/task-badges";
import { buildHref, normalizeSearchParams } from "@/lib/urls";
import { db } from "@/server/db/client";
import { loadProject } from "@/server/projects/loaders";
import { listStatuses } from "@/server/projects/service";
import { listProjectTasks } from "@/server/tasks/queries";

export default async function BoardPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const params = normalizeSearchParams(await props.searchParams);
  const { project } = await loadProject(id);
  const [columns, rows] = await Promise.all([
    listStatuses(db(), project.id),
    listProjectTasks(db(), project.id, {}, { field: "status", dir: "asc" }),
  ]);
  const basePath = `/projects/${project.id}/board`;

  return (
    <div className="flex gap-4 overflow-x-auto">
      {columns.map((status) => {
        const cards = rows.filter((r) => r.status.id === status.id);
        return (
          <section key={status.id} aria-label={status.name} className="w-72 shrink-0 rounded-lg bg-muted/40 p-3">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <span className="size-2 rounded-full" style={{ backgroundColor: status.color }} />
              {status.name}
              <span className="text-xs text-muted-foreground">{cards.length}</span>
            </h2>
            {cards.length === 0 && <p className="text-xs text-muted-foreground">Keine Aufgaben</p>}
            <ul className="space-y-2">
              {cards.map((card) => (
                <li key={card.id}>
                  <Link
                    href={buildHref(basePath, params, { task: card.id })}
                    className="block rounded-md border bg-background p-2 text-sm shadow-xs hover:border-primary/40"
                  >
                    <span className="block text-xs text-muted-foreground">
                      {card.key}-{card.number}
                    </span>
                    <span className="block">{card.title}</span>
                    {card.dueDate && <DueDate date={card.dueDate} isDone={card.status.isDone} />}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 7: Label-Verwaltung** – `src/components/projects/label-manager.tsx`

```tsx
"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createLabelAction, deleteLabelAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LABEL_COLORS } from "@/lib/labels";

type LabelItem = { id: string; name: string; color: string };

export function LabelManager(props: { projectId: string; labels: LabelItem[]; canManage: boolean }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(LABEL_COLORS[5].value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const res = await createLabelAction({ projectId: props.projectId, name, color });
      if (!res.ok) {
        setError(res.error.fieldErrors?.name?.[0] ?? res.error.message);
        return;
      }
      setError(null);
      setName("");
    });
  }

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {props.labels.length === 0 && <li className="text-sm text-muted-foreground">Noch keine Labels.</li>}
        {props.labels.map((l) => (
          <li key={l.id} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-sm">
            <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
            {l.name}
            {props.canManage && (
              <button
                type="button"
                aria-label={`Label ${l.name} löschen`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() =>
                  startTransition(async () => {
                    const res = await deleteLabelAction(l.id);
                    if (!res.ok) toast.error(res.error.message);
                  })
                }
              >
                <X className="size-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {props.canManage && (
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="label-name">Label-Name</Label>
            <Input id="label-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="h-8 w-48" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="label-color">Farbe</Label>
            <select
              id="label-color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              {LABEL_COLORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Label hinzufügen
          </Button>
          {error && (
            <p role="alert" className="w-full text-xs text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
```

`src/app/(app)/projects/[id]/settings/page.tsx`: Imports ergänzen und nach der Status-Sektion eine Label-Sektion einfügen.
```tsx
import { LabelManager } from "@/components/projects/label-manager";
import { listLabels } from "@/server/labels/service";
import { can, projectCtx } from "@/server/permissions";
```
- In der Funktion `const { project } = await loadProject(id);` ersetzen durch `const { actor, project, role } = await loadProject(id);`.
- `const columns = …` ersetzen durch `const [columns, labels] = await Promise.all([listStatuses(db(), project.id), listLabels(db(), project.id)]);`.
- Nach der `</section>` der Status-Spalten einfügen:
```tsx
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Labels</h2>
        <LabelManager projectId={project.id} labels={labels} canManage={can(actor, "project.update", projectCtx(role))} />
      </section>
```

- [ ] **Step 8: Statisch prüfen und manuell kontrollieren**

Run: `npm run -s typecheck && npm run -s lint && npx vitest run`
Expected: keine Fehler, alle Unit-Tests grün

Dann `npm run dev`. Im Browser (eingeloggt als Admin aus M1, beliebiges Projekt):
- **Liste:** Drei Aufgaben per Schnell-Eingabe anlegen → sie erscheinen sofort als `KEY-1..3`, das Eingabefeld ist wieder leer.
- **Filter und Sortierung:**
  - Priorität „Hoch“ filtern → leere Treffermeldung „Keine Treffer“
  - Klick auf „Titel“ → alphabetische Sortierung, zweiter Klick → absteigend
  - `?status=abc` in die URL schreiben → die Liste erscheint ungefiltert, kein Fehler
- **Board:** Die Karten stehen in „Offen“.
- **Einstellungen:** Label „Design“ (Lila) anlegen. Dasselbe in Kleinschrift noch einmal → Meldung „Das Label „design“ gibt es schon.“; löschen funktioniert.

Dev-Server danach beenden.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(ui): add task list with quick add, filters and sorting, board cards and label settings"
```

---

### Task 10: Aufgaben-Panel, Aufgaben-Seite, Editor

**Files:**
- Create: `src/components/tasks/use-task-href.ts`, `src/components/tasks/task-editor.tsx`, `src/components/tasks/multi-select.tsx`, `src/components/tasks/task-checklist.tsx`, `src/components/tasks/task-subtasks.tsx`, `src/components/tasks/task-panel.tsx`, `src/components/tasks/panel-header.tsx`, `src/app/(app)/tasks/[id]/page.tsx`
- Modify: `src/app/(app)/projects/[id]/list/page.tsx`, `src/app/(app)/projects/[id]/board/page.tsx`

**Interfaces:**
- Consumes: `getTaskDetail`, `TaskDetail` (Task 7), alle Task-Actions (Task 8), `QuickAdd` (Task 9), `buildHref`, `normalizeSearchParams`, `PRIORITY_LABELS`, `TASK_PRIORITIES` (Task 1), `requireActor` (M1)
- Produces:
  - `useTaskHref(): (taskId: string) => string` – auf `/tasks/*` → `/tasks/<id>`, sonst aktuelle Seite mit `?task=<id>`
  - `<TaskEditor detail />` (Client)
  - `<TaskPanel taskId />` (Server, rechts neben dem Inhalt)
  - `<WithTaskPanel taskId? >{children}</WithTaskPanel>`
  - Route `/tasks/[id]`

Feste UI-Bezeichner für Task 11:
- Panel `aria-label="Aufgabe"`; Links „Schließen“ und „Als Seite öffnen“
- Felder per Label: „Titel“, „Status“, „Priorität“, „Start“, „Fällig“, „Beschreibung“; Mehrfachauswahl „Zuständige“, „Labels“
- Sektionen `aria-label="Unteraufgaben"` (Eingabe „Neue Unteraufgabe“) und `aria-label="Checkliste"` (Eingabe „Neuer Checklisten-Punkt“, Checkbox mit dem Punkt-Text als Label, Löschen „<Text> löschen“)
- Parent-Hinweis „Teil von KEY-n“
- Konflikt-Toast „Die Aufgabe wurde zwischenzeitlich geändert.“ mit Aktion „Neu laden“

- [ ] **Step 1: Link-Hook** – `src/components/tasks/use-task-href.ts`

```ts
"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { buildHref, normalizeSearchParams } from "@/lib/urls";

/** Link to a task: on the task page → its own page, elsewhere → same view with the panel open. */
export function useTaskHref(): (taskId: string) => string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (taskId) => {
    if (pathname.startsWith("/tasks/")) return `/tasks/${taskId}`;
    return buildHref(pathname, normalizeSearchParams(Object.fromEntries(searchParams.entries())), { task: taskId });
  };
}
```

- [ ] **Step 2: Mehrfachauswahl** – `src/components/tasks/multi-select.tsx`

```tsx
"use client";

import { useOptimistic, useTransition } from "react";

type Option = { id: string; name: string; color?: string };

/** Native <details> dropdown with checkboxes – no popover library needed. */
export function MultiSelect(props: {
  label: string;
  options: Option[];
  selected: string[];
  disabled: boolean;
  onChange: (ids: string[]) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(props.selected);
  const summary = props.options.filter((o) => optimistic.includes(o.id)).map((o) => o.name).join(", ") || "–";

  function toggle(id: string, checked: boolean) {
    const next = checked ? [...optimistic, id] : optimistic.filter((x) => x !== id);
    startTransition(async () => {
      setOptimistic(next);
      await props.onChange(next);
    });
  }

  return (
    <details className="relative">
      <summary aria-label={props.label} className="cursor-pointer list-none truncate rounded-md border px-2 py-1 text-sm">
        {summary}
      </summary>
      <div role="group" aria-label={props.label} className="absolute z-20 mt-1 w-60 space-y-1 rounded-md border bg-popover p-2 shadow-md">
        {props.options.length === 0 && <p className="text-xs text-muted-foreground">Keine Einträge</p>}
        {props.options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={optimistic.includes(o.id)}
              disabled={props.disabled || pending}
              onChange={(e) => toggle(o.id, e.target.checked)}
            />
            {o.color && <span className="size-2 rounded-full" style={{ backgroundColor: o.color }} />}
            {o.name}
          </label>
        ))}
      </div>
    </details>
  );
}
```

- [ ] **Step 3: Checkliste und Unteraufgaben**

`src/components/tasks/task-checklist.tsx`:
```tsx
"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addChecklistItemAction, deleteChecklistItemAction, toggleChecklistItemAction } from "@/app/(app)/tasks/actions";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/server/action-result";
import type { TaskDetail } from "@/server/tasks/queries";

export function TaskChecklist({ detail }: { detail: TaskDetail }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const done = detail.checklist.filter((i) => i.done).length;

  function run(action: () => Promise<ActionResult<void>>, onOk?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) toast.error(res.error.fieldErrors ? "Text fehlt" : res.error.message);
      else onOk?.();
    });
  }

  return (
    <section aria-label="Checkliste" className="space-y-2">
      <h3 className="text-sm font-medium">
        Checkliste {detail.checklist.length > 0 && <span className="text-muted-foreground">{done}/{detail.checklist.length}</span>}
      </h3>
      <ul className="space-y-1">
        {detail.checklist.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label={item.text}
              checked={item.done}
              disabled={!detail.canEdit || pending}
              onChange={(e) => run(() => toggleChecklistItemAction(item.id, e.target.checked))}
            />
            <span className={item.done ? "text-muted-foreground line-through" : undefined}>{item.text}</span>
            {detail.canEdit && (
              <button
                type="button"
                aria-label={`${item.text} löschen`}
                className="ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => run(() => deleteChecklistItemAction(item.id))}
              >
                <X className="size-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {detail.canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            run(() => addChecklistItemAction(detail.id, text), () => setText(""));
          }}
        >
          <Input
            aria-label="Neuer Checklisten-Punkt"
            placeholder="Punkt hinzufügen… (Enter)"
            value={text}
            maxLength={300}
            readOnly={pending}
            onChange={(e) => setText(e.target.value)}
            className="h-8"
          />
        </form>
      )}
    </section>
  );
}
```

`src/components/tasks/task-subtasks.tsx`:
```tsx
"use client";

import Link from "next/link";
import type { TaskDetail } from "@/server/tasks/queries";
import { QuickAdd } from "./quick-add";
import { useTaskHref } from "./use-task-href";

export function TaskSubtasks({ detail }: { detail: TaskDetail }) {
  const href = useTaskHref();
  const done = detail.subtasks.filter((s) => s.isDone).length;
  return (
    <section aria-label="Unteraufgaben" className="space-y-2">
      <h3 className="text-sm font-medium">
        Unteraufgaben {detail.subtasks.length > 0 && <span className="text-muted-foreground">{done}/{detail.subtasks.length}</span>}
      </h3>
      <ul className="space-y-1">
        {detail.subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <span aria-hidden>{s.isDone ? "☑" : "☐"}</span>
            <Link href={href(s.id)} className={s.isDone ? "text-muted-foreground line-through" : "hover:underline"}>
              <span className="text-xs text-muted-foreground">
                {detail.key}-{s.number}
              </span>{" "}
              {s.title}
            </Link>
          </li>
        ))}
      </ul>
      {detail.hintAllSubtasksDone && (
        <p role="status" className="rounded-md bg-muted px-2 py-1 text-xs">
          Alle Unteraufgaben sind erledigt – Aufgabe abschließen?
        </p>
      )}
      {detail.canEdit && (
        <QuickAdd projectId={detail.projectId} parentId={detail.id} label="Neue Unteraufgabe" placeholder="Unteraufgabe hinzufügen… (Enter)" />
      )}
    </section>
  );
}
```

- [ ] **Step 4: Editor** – `src/components/tasks/task-editor.tsx`

```tsx
"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { setAssigneesAction, setLabelsAction, updateTaskAction } from "@/app/(app)/tasks/actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TASK_PRIORITIES, type TaskPriority } from "@/lib/enums";
import { PRIORITY_LABELS } from "@/lib/priority";
import type { TaskPatch } from "@/lib/schemas/task";
import type { TaskDetail } from "@/server/tasks/queries";
import { MultiSelect } from "./multi-select";
import { TaskChecklist } from "./task-checklist";
import { TaskSubtasks } from "./task-subtasks";
import { useTaskHref } from "./use-task-href";

const fieldClass = "h-8 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-60";

/**
 * Optimistic-lock editor.
 * - `updatedAt` only advances through *our own* successful saves – never from re-rendered props – so a
 *   change by someone else is always detected as CONFLICT on our next save.
 * - Saves run one after another: a quick "title, then status" must not race against its own stamp.
 * Render with key={detail.id}.
 */
export function TaskEditor({ detail }: { detail: TaskDetail }) {
  const latestUpdatedAt = useRef(detail.updatedAt);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const href = useTaskHref();
  const disabled = !detail.canEdit;

  function save(patch: TaskPatch): Promise<boolean> {
    const run = queue.current.then(() => saveNow(patch));
    queue.current = run.catch(() => undefined);
    return run;
  }

  async function saveNow(patch: TaskPatch): Promise<boolean> {
    const res = await updateTaskAction(detail.id, latestUpdatedAt.current, patch);
    if (res.ok) {
      latestUpdatedAt.current = res.data.updatedAt;
      return true;
    }
    if (res.error.code === "CONFLICT") {
      toast.error(res.error.message, {
        duration: Infinity,
        action: { label: "Neu laden", onClick: () => window.location.reload() },
      });
    } else {
      const fieldMessage = res.error.fieldErrors ? Object.values(res.error.fieldErrors).flat()[0] : undefined;
      toast.error(fieldMessage ?? res.error.message);
    }
    return false;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {detail.key}-{detail.number}
          {detail.parent && (
            <>
              {" · Teil von "}
              <Link href={href(detail.parent.id)} className="hover:underline">
                {detail.key}-{detail.parent.number} {detail.parent.title}
              </Link>
            </>
          )}
        </p>
        <TextField label="Titel" initial={detail.title} disabled={disabled} save={(title) => save({ title })} large />
      </div>

      <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-2 text-sm">
        <SelectField
          id="task-status"
          label="Status"
          initial={detail.statusId}
          disabled={disabled}
          options={detail.statuses.map((s) => ({ value: s.id, label: s.name }))}
          save={(statusId) => save({ statusId })}
        />
        <SelectField
          id="task-priority"
          label="Priorität"
          initial={detail.priority}
          disabled={disabled}
          options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
          save={(priority) => save({ priority: priority as TaskPriority })}
        />
        <DateField id="task-start" label="Start" initial={detail.startDate} disabled={disabled} save={(startDate) => save({ startDate })} />
        <DateField id="task-due" label="Fällig" initial={detail.dueDate} disabled={disabled} save={(dueDate) => save({ dueDate })} />
        <span className="text-muted-foreground">Zuständige</span>
        <MultiSelect
          label="Zuständige"
          options={detail.members}
          selected={detail.assigneeIds}
          disabled={disabled}
          onChange={async (ids) => {
            const res = await setAssigneesAction(detail.id, ids);
            if (!res.ok) toast.error(res.error.message);
          }}
        />
        <span className="text-muted-foreground">Labels</span>
        <MultiSelect
          label="Labels"
          options={detail.labels}
          selected={detail.labelIds}
          disabled={disabled}
          onChange={async (ids) => {
            const res = await setLabelsAction(detail.id, ids);
            if (!res.ok) toast.error(res.error.message);
          }}
        />
      </div>

      <TextField label="Beschreibung" initial={detail.description} disabled={disabled} save={(description) => save({ description })} multiline />

      {!detail.parent && <TaskSubtasks detail={detail} />}
      <TaskChecklist detail={detail} />
    </div>
  );
}

function TextField(props: {
  label: string;
  initial: string;
  disabled: boolean;
  save: (value: string) => Promise<boolean>;
  large?: boolean;
  multiline?: boolean;
}) {
  const [value, setValue] = useState(props.initial);
  const [saved, setSaved] = useState(props.initial);

  async function commit() {
    const next = props.multiline ? value : value.trim();
    if (!props.multiline && !next) {
      setValue(saved);
      return;
    }
    if (next === saved) return;
    if (await props.save(next)) setSaved(next);
  }

  if (props.multiline) {
    return (
      <div className="space-y-1">
        <label htmlFor="task-description" className="text-sm font-medium">
          {props.label}
        </label>
        <Textarea
          id="task-description"
          value={value}
          disabled={props.disabled}
          rows={6}
          placeholder="Details, Links, Notizen…"
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
        />
      </div>
    );
  }
  return (
    <Input
      aria-label={props.label}
      value={value}
      disabled={props.disabled}
      maxLength={200}
      className={props.large ? "h-10 text-lg font-semibold" : undefined}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function SelectField(props: {
  id: string;
  label: string;
  initial: string;
  disabled: boolean;
  options: { value: string; label: string }[];
  save: (value: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(props.initial);
  return (
    <>
      <label htmlFor={props.id} className="text-muted-foreground">
        {props.label}
      </label>
      <select
        id={props.id}
        className={fieldClass}
        value={value}
        disabled={props.disabled}
        onChange={async (e) => {
          const previous = value;
          setValue(e.target.value);
          if (!(await props.save(e.target.value))) setValue(previous);
        }}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}

function DateField(props: {
  id: string;
  label: string;
  initial: string | null;
  disabled: boolean;
  save: (value: string | null) => Promise<boolean>;
}) {
  const [value, setValue] = useState(props.initial ?? "");
  return (
    <>
      <label htmlFor={props.id} className="text-muted-foreground">
        {props.label}
      </label>
      <input
        id={props.id}
        type="date"
        className={fieldClass}
        value={value}
        disabled={props.disabled}
        onChange={async (e) => {
          const previous = value;
          setValue(e.target.value);
          if (!(await props.save(e.target.value || null))) setValue(previous);
        }}
      />
    </>
  );
}
```

- [ ] **Step 5: Panel und Seite**

`src/components/tasks/task-panel.tsx`:
```tsx
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getTaskDetail } from "@/server/tasks/queries";
import { PanelHeader } from "./panel-header";
import { TaskEditor } from "./task-editor";

export async function TaskPanel({ taskId }: { taskId: string }) {
  const actor = await requireActor();
  const detail = await getTaskDetail(db(), actor, taskId);
  return (
    <aside aria-label="Aufgabe" className="w-[28rem] max-w-full shrink-0 space-y-4 border-l pl-6">
      <PanelHeader taskId={detail?.id} />
      {detail ? <TaskEditor key={detail.id} detail={detail} /> : <p className="text-sm text-muted-foreground">Aufgabe nicht gefunden.</p>}
    </aside>
  );
}

export function WithTaskPanel({ taskId, children }: { taskId?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">{children}</div>
      {taskId && <TaskPanel taskId={taskId} />}
    </div>
  );
}
```

`src/components/tasks/panel-header.tsx`:
```tsx
"use client";

import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { buildHref, normalizeSearchParams } from "@/lib/urls";

export function PanelHeader({ taskId }: { taskId?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const closeHref = buildHref(pathname, normalizeSearchParams(Object.fromEntries(searchParams.entries())), { task: null });
  return (
    <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
      {taskId && (
        <Link href={`/tasks/${taskId}`} className="inline-flex items-center gap-1 hover:text-foreground">
          <ExternalLink className="size-3" /> Als Seite öffnen
        </Link>
      )}
      <Link href={closeHref} className="inline-flex items-center gap-1 hover:text-foreground">
        <X className="size-3" /> Schließen
      </Link>
    </div>
  );
}
```

`src/app/(app)/tasks/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskEditor } from "@/components/tasks/task-editor";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getTaskDetail } from "@/server/tasks/queries";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const detail = await getTaskDetail(db(), actor, id);
  if (!detail) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Link href={`/projects/${detail.projectId}/list`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {detail.projectName}
      </Link>
      <TaskEditor key={detail.id} detail={detail} />
    </div>
  );
}
```

In `src/app/(app)/projects/[id]/list/page.tsx` und `.../board/page.tsx`:
- `import { WithTaskPanel } from "@/components/tasks/task-panel";` ergänzen
- das jeweils äußerste zurückgegebene `<div …>` in `<WithTaskPanel taskId={params.task}> … </WithTaskPanel>` einwickeln

- [ ] **Step 6: Statisch prüfen und manuell kontrollieren**

Run: `npm run -s typecheck && npm run -s lint && npx vitest run`
Expected: keine Fehler, alle Unit-Tests grün

Dann `npm run dev`, Liste eines Projekts öffnen, auf einen Aufgabentitel klicken:
- Das Panel öffnet sich rechts, die URL enthält `?task=`.
- Titel ändern + Enter, Status „In Arbeit“, Priorität „Hoch“, Fällig setzen → die Liste links aktualisiert sich.
- Start nach Fällig setzen → Toast „Der Start liegt nach dem Fälligkeitsdatum.“, das Feld springt zurück.
- Unteraufgabe „Logo“ anlegen → erscheint mit `KEY-n`; ein Klick öffnet sie im Panel mit „Teil von …“.
- Checklisten-Punkt anlegen, abhaken, löschen.
- „Als Seite öffnen“ → `/tasks/<id>` zeigt denselben Editor. `/tasks/kaputt` → 404.
- `?task=kaputt` in der Liste → Panel „Aufgabe nicht gefunden.“

Dev-Server danach beenden.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): add task panel, task page and editor with conflict handling"
```

---

### Task 11: E2E für den Aufgaben-Kern

**Files:**
- Create: `tests/e2e/tasks.spec.ts`
- Modify: `tests/e2e/fixtures.ts`

**Interfaces:**
- Consumes: UI-Bezeichner aus Tasks 9 und 10, `login` (M1)
- Produces: `createProjectViaUi(page, name, key): Promise<string>` (gibt die Board-URL zurück)

Hinweis aus M1: `getByRole("alert")` immer nach Text filtern, weil der Route-Announcer von Next ebenfalls `role="alert"` trägt. Die Toasts von Sonner finden sich per `getByText`.

- [ ] **Step 1: Fixture ergänzen** – `tests/e2e/fixtures.ts` am Ende

```ts

export async function createProjectViaUi(page: Page, name: string, key: string): Promise<string> {
  await page.getByRole("button", { name: "Neues Projekt" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Kürzel").fill(key);
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page).toHaveURL(/\/board$/);
  return page.url();
}
```

- [ ] **Step 2: Tests schreiben** – `tests/e2e/tasks.spec.ts`

```ts
import { expect, test, type Page } from "@playwright/test";
import { createProjectViaUi, login } from "./fixtures";

async function openList(page: Page, boardUrl: string) {
  await page.goto(boardUrl.replace(/\/board$/, "/list"));
}

async function quickAdd(page: Page, title: string) {
  const input = page.getByLabel("Neue Aufgabe", { exact: true });
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByRole("table", { name: "Aufgaben" }).getByRole("link", { name: title })).toBeVisible();
}

test("creates tasks, edits them in the panel and shows them on the board", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Aufgaben-Test", "tsk");
  await openList(page, board);
  await quickAdd(page, "Header bauen");
  await quickAdd(page, "Footer bauen");

  const table = page.getByRole("table", { name: "Aufgaben" });
  await expect(table.getByRole("row").nth(1)).toContainText("TSK-1");

  await table.getByRole("link", { name: "Header bauen" }).click();
  const panel = page.getByRole("complementary", { name: "Aufgabe" });
  await expect(panel.getByLabel("Titel")).toHaveValue("Header bauen");

  await panel.getByLabel("Titel").fill("Header bauen (responsive)");
  await panel.getByLabel("Titel").press("Enter");
  await panel.getByLabel("Status").selectOption({ label: "In Arbeit" });
  await panel.getByLabel("Priorität").selectOption({ label: "Hoch" });
  await panel.getByLabel("Fällig").fill("2030-01-15");

  const row = table.getByRole("row", { name: /Header bauen \(responsive\)/ });
  await expect(row).toContainText("In Arbeit");
  await expect(row).toContainText("Hoch");
  await expect(row).toContainText("15.01.2030");

  await page.goto(board);
  await expect(page.getByRole("region", { name: "In Arbeit" })).toContainText("Header bauen (responsive)");
  await expect(page.getByRole("region", { name: "Offen" })).toContainText("Footer bauen");
});

test("manages subtasks, checklist, labels and filters", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Struktur-Test", "str");
  await page.goto(board.replace(/\/board$/, "/settings"));
  await page.getByLabel("Label-Name").fill("Design");
  await page.getByRole("button", { name: "Label hinzufügen" }).click();
  await expect(page.getByRole("button", { name: "Label Design löschen" })).toBeVisible();

  await openList(page, board);
  await quickAdd(page, "Logo");
  await quickAdd(page, "Impressum");
  const table = page.getByRole("table", { name: "Aufgaben" });
  await table.getByRole("link", { name: "Logo" }).click();
  const panel = page.getByRole("complementary", { name: "Aufgabe" });

  const subInput = panel.getByLabel("Neue Unteraufgabe");
  await subInput.fill("Entwurf");
  await subInput.press("Enter");
  await expect(panel.getByRole("region", { name: "Unteraufgaben" })).toContainText("STR-3");

  const checkInput = panel.getByLabel("Neuer Checklisten-Punkt");
  await checkInput.fill("Farben festlegen");
  await checkInput.press("Enter");
  await panel.getByRole("checkbox", { name: "Farben festlegen" }).check();
  await expect(panel.getByRole("region", { name: "Checkliste" })).toContainText("1/1");

  await panel.getByLabel("Labels").first().click();
  await panel.getByRole("group", { name: "Labels" }).getByLabel("Design").check();
  await expect(table.getByRole("row", { name: /Logo/ })).toContainText("Design");
  await expect(table.getByRole("row", { name: /Logo/ })).toContainText("0/1");

  await page.getByLabel("Label", { exact: true }).selectOption({ label: "Design" });
  await expect(table.getByRole("link", { name: "Logo" })).toBeVisible();
  await expect(table.getByRole("link", { name: "Impressum" })).toHaveCount(0);

  await panel.getByRole("region", { name: "Unteraufgaben" }).getByRole("link", { name: /Entwurf/ }).click();
  await expect(panel).toContainText("Teil von STR-1");
  await panel.getByRole("link", { name: "Als Seite öffnen" }).click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Titel")).toHaveValue("Entwurf");
});

test("detects concurrent edits instead of overwriting", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await login(a);
  await login(b);
  const board = await createProjectViaUi(a, "Konflikt-Test", "kon");
  await openList(a, board);
  await quickAdd(a, "Gemeinsam");
  await a.getByRole("table", { name: "Aufgaben" }).getByRole("link", { name: "Gemeinsam" }).click();
  await a.getByRole("link", { name: "Als Seite öffnen" }).click();
  await b.goto(a.url());

  await a.getByLabel("Titel").fill("Version A");
  await a.getByLabel("Titel").press("Enter");
  await expect(a.getByText("Die Aufgabe wurde zwischenzeitlich geändert.")).toHaveCount(0);
  await a.waitForLoadState("networkidle");

  await b.getByLabel("Titel").fill("Version B");
  await b.getByLabel("Titel").press("Enter");
  await expect(b.getByText("Die Aufgabe wurde zwischenzeitlich geändert.")).toBeVisible();
  await b.getByRole("button", { name: "Neu laden" }).click();
  await expect(b.getByLabel("Titel")).toHaveValue("Version A");

  await ctxA.close();
  await ctxB.close();
});

test("returns 404 for unknown task pages and tolerates bad panel ids", async ({ page }) => {
  await login(page);
  const res = await page.goto("/tasks/kaputt");
  expect(res?.status()).toBe(404);
  const board = await createProjectViaUi(page, "Fehler-Test", "err");
  await page.goto(`${board.replace(/\/board$/, "/list")}?task=kaputt&status=abc`);
  await expect(page.getByRole("complementary", { name: "Aufgabe" })).toContainText("Aufgabe nicht gefunden.");
});
```

- [ ] **Step 3: E2E laufen lassen**

Vorher einen laufenden `npm run dev` beenden.

Run: `npm run test:e2e`
Expected: 11 passed (7 aus M1 + 4 neu). Bei Fehlschlag Trace öffnen (`npx playwright show-trace …`) und die App korrigieren. Den Test nur anpassen, wenn er der Spec widerspricht; das als Ruling festhalten.

- [ ] **Step 4: Gesamte Suite und Commit**

Run: `npm run -s typecheck && npm run -s lint && npx vitest run && npm run test:e2e`
Expected: alles grün

```bash
git add -A
git commit -m "test(e2e): cover task creation, panel editing, structure, filters and conflicts"
```

---

## Abschluss M2

- Alle Unit- und E2E-Tests sind grün; Liste, Panel, Seite und Board funktionieren mit echten Aufgaben
- Danach: Plan für **M3 Kanban** (Drag & Drop, Kartendichte, Status-Spalten verwalten, Mitgliederverwaltung) auf Basis des echten Codes aus M2
