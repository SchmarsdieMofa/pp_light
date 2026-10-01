# M1 Fundament – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lauffähiges Grundgerüst von pp_light. Ein Admin meldet sich per Passwort an, legt Projekte an (mit Standard-Status-Spalten) und sieht sie in der Seitenleiste. Hell/Dunkel wird pro Nutzer gespeichert. Alles läuft per Docker.

**Architecture:** Next.js-16-Monolith (App Router, Server Actions). Die Fachlogik liegt in `src/server/<modul>/service.ts`. Services bekommen die DB als Parameter und sind dadurch gegen eine echte Postgres-Testdatenbank testbar. UI → Server Action → zod → `can()` → Service. Auth.js v5 mit Credentials und JWT-Session; bei jedem Request wird der User zusätzlich in der DB geprüft (aktiv?).

**Tech Stack:** Next.js 16.3, React 19, TypeScript, Tailwind v4 + shadcn/ui, Drizzle ORM 0.45 + node-postgres, PostgreSQL 17, next-auth 5.0.0-beta.32, @node-rs/argon2, zod 4, next-themes, fractional-indexing, Vitest 5, Playwright 1.63, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-30-pp-light-design.md` · **Roadmap:** `docs/superpowers/plans/2026-10-01-roadmap.md`

## Global Constraints

- Node 24, npm. Alle Befehle laufen im Repo-Root `E:\projects\pp_light` (Git Bash)
- UI-Texte auf Deutsch. Code, Bezeichner und Commit-Messages auf Englisch
- `src/server/**` importiert nie aus `src/app/**` oder `src/components/**`
- Services bekommen `db: DB` als ersten Parameter und importieren kein `next/*`. `server-only`, `redirect` und `auth()` gibt es nur in `src/server/auth/session.ts`, `src/auth.ts` und Dateien unter `src/app/**`
- Server Actions liefern `{ ok: true, data } | { ok: false, error: { code, message, fieldErrors? } }` über `runAction()`
- Projekte sind nur für Mitglieder sichtbar; Admin sieht alles. Fremde oder ungültige Projekt-IDs → 404
- Sortierspalten `position` (fractional index) werden immer mit `COLLATE "C"` sortiert, über `byPosition()`
- Passwörter: argon2id, mindestens 10 Zeichen. E-Mails werden immer `trim().toLowerCase()` normalisiert
- Standard-Status für neue Projekte: Offen `#94a3b8`, In Arbeit `#3b82f6`, Review `#a855f7`, Fertig `#22c55e` (is_done)
- Projekt-Kürzel: `^[A-Z][A-Z0-9]{1,9}$` nach trim + Großschreibung, global eindeutig
- Commits: Conventional Commits, eine Aufgabe = mindestens ein Commit

## Review Focus

1. **E-Mail mit anderer Schreibweise oder Leerzeichen** (`" Admin@Example.COM "`) beim Anlegen oder Login → funktioniert wie die normalisierte Adresse. *Test: Task 3*
2. **Deaktivierter Nutzer mit noch gültigem JWT** → beim nächsten Request kein Zugriff mehr, Weiterleitung zu `/login`, keine Redirect-Schleife. *Test: Task 5 (`resolveActor`), Login-Seite leitet nur bei aktivem Actor weiter*
3. **Fremde oder kaputte Projekt-URL** (Nicht-Mitglied, `/projects/abc`) → 404 ohne Datenleck, kein 500. *Test: Task 6*
4. **Projekt-Kürzel kleingeschrieben, mit Leerzeichen oder doppelt (auch gleichzeitig angelegt)** → wird normalisiert. Ein Duplikat ergibt die verständliche Meldung `KEY_TAKEN` statt eines 500. *Test: Task 6 + E2E Task 9*
5. **Fehlende oder zu kurze Konfiguration** (`AUTH_SECRET`, `DATABASE_URL`) → klare Fehlermeldung mit Variablennamen. *Test: Task 1*

---

## Dateistruktur nach M1

```
docker-compose.yml               # Prod: app + postgres
docker-compose.dev.yml           # Dev: postgres (+ Test-DBs) + mailpit
docker/postgres/init.sql         # legt pp_light_test + pp_light_e2e an
docker/entrypoint.sh             # Migrationen, dann server.js
Dockerfile
.env.example
drizzle.config.ts
next.config.ts
vitest.config.ts
playwright.config.ts
scripts/migrate.ts               # Migrationen ausführen
scripts/create-admin.ts          # ersten Admin anlegen
src/auth.ts                      # Auth.js-Konfiguration
src/lib/env.ts                   # Env-Prüfung (zod)
src/lib/enums.ts                 # Rollen, Theme, Kartendichte
src/lib/schemas/auth.ts          # loginSchema
src/lib/schemas/project.ts       # createProjectSchema
src/server/errors.ts             # DomainError, isUniqueViolation
src/server/action-result.ts      # ActionResult, runAction
src/server/db/{schema,client,order}.ts, migrations/
src/server/auth/{password,actor,session}.ts
src/server/permissions/index.ts  # can, assertCan
src/server/users/service.ts
src/server/projects/{service,loaders}.ts
src/server/preferences/service.ts
src/app/layout.tsx, globals.css
src/app/api/auth/[...nextauth]/route.ts
src/app/(auth)/login/{page,login-form,actions}.tsx|ts
src/app/(app)/{layout,page,actions}.tsx|ts
src/app/(app)/projects/actions.ts
src/app/(app)/projects/[id]/{layout,page}.tsx, board|gantt|list|settings/page.tsx
src/components/shell/{sidebar,user-menu,theme-sync,project-tabs,empty-state}.tsx
src/components/projects/new-project-dialog.tsx
src/components/ui/*              # shadcn
tests/setup.ts, tests/global-setup.ts
tests/helpers/{test-env,truncate,db}.ts
tests/unit/*.test.ts
tests/e2e/{global-setup,fixtures}.ts, *.spec.ts
```

---

### Task 1: Scaffold, Dev-Docker, Env-Prüfung

**Files:**
- Create: Next.js-Scaffold (via create-next-app), `docker-compose.dev.yml`, `docker/postgres/init.sql`, `.env.example`, `src/lib/env.ts`, `vitest.config.ts`, `tests/unit/env.test.ts`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Produces: `parseEnv(raw: Record<string, string | undefined>): Env`, `getEnv(): Env` mit `Env = { DATABASE_URL: string; AUTH_SECRET: string; APP_URL: string; UPLOAD_MAX_MB: number }`

- [ ] **Step 1: Next.js in einen Nachbarordner scaffolden und ins Repo kopieren** (das Repo ist nicht leer, create-next-app würde abbrechen)

```bash
cd /e/projects
npx create-next-app@16.3.8 pp-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --turbopack --disable-git --yes
cp -rn pp-scaffold/. pp_light/
rm -rf pp-scaffold
cd /e/projects/pp_light
```
Expected: `package.json`, `src/app/page.tsx`, `next.config.ts` und `node_modules/` liegen in `pp_light`; `docs/` ist unverändert.

- [ ] **Step 2: Abhängigkeiten installieren**

```bash
npm i drizzle-orm@0.45.3 pg@^8 zod@^4.6 next-auth@5.0.0-beta.32 @node-rs/argon2@^2.2 fractional-indexing@^4 next-themes server-only lucide-react
npm i -D drizzle-kit@0.31.11 @types/pg vitest@^5 tsx esbuild @playwright/test@^1.63
```

- [ ] **Step 3: Dev-Docker anlegen**

`docker-compose.dev.yml`:
```yaml
name: pp_light_dev
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: pp
      POSTGRES_PASSWORD: pp
      POSTGRES_DB: pp_light
    ports:
      - "5432:5432"
    volumes:
      - pgdata_dev:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pp -d pp_light"]
      interval: 2s
      retries: 30
  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "8025:8025"
      - "1025:1025"
volumes:
  pgdata_dev:
```

`docker/postgres/init.sql`:
```sql
CREATE DATABASE pp_light_test;
CREATE DATABASE pp_light_e2e;
```

Run: `docker compose -f docker-compose.dev.yml up -d --wait`
Expected: beide Container `healthy`/`running`. Prüfen: `docker compose -f docker-compose.dev.yml exec postgres psql -U pp -lqt | cut -d'|' -f1` listet `pp_light`, `pp_light_test`, `pp_light_e2e`.

- [ ] **Step 4: `.env.example` anlegen, nach `.env.local` kopieren, `.gitignore` anpassen**

`.env.example`:
```
# App
DATABASE_URL=postgres://pp:pp@localhost:5432/pp_light
AUTH_SECRET=change-me-to-a-random-string-with-at-least-32-chars
AUTH_TRUST_HOST=true
APP_URL=http://localhost:3000
UPLOAD_MAX_MB=25

# Nur docker-compose.yml (Produktion)
POSTGRES_USER=pp
POSTGRES_PASSWORD=change-me
POSTGRES_DB=pp_light
```

```bash
cp .env.example .env.local
sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")|" .env.local
printf '\n!.env.example\n/dist\n/test-results\n/playwright-report\n' >> .gitignore
```

- [ ] **Step 5: Vitest konfigurieren**

`vitest.config.ts`:
```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    fileParallelism: false,
  },
});
```

- [ ] **Step 6: Fehlschlagenden Test schreiben**

`tests/unit/env.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  DATABASE_URL: "postgres://pp:pp@localhost:5432/pp_light",
  AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.UPLOAD_MAX_MB).toBe(25);
  });

  it("coerces numbers", () => {
    expect(parseEnv({ ...valid, UPLOAD_MAX_MB: "50" }).UPLOAD_MAX_MB).toBe(50);
  });

  it("names the missing variable", () => {
    expect(() => parseEnv({ AUTH_SECRET: valid.AUTH_SECRET })).toThrow(/DATABASE_URL/);
  });

  it("rejects a short AUTH_SECRET", () => {
    expect(() => parseEnv({ ...valid, AUTH_SECRET: "kurz" })).toThrow(/AUTH_SECRET/);
  });
});
```

- [ ] **Step 7: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/unit/env.test.ts`
Expected: FAIL – `Failed to resolve import "@/lib/env"`

- [ ] **Step 8: `src/lib/env.ts` implementieren**

```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, "mindestens 32 Zeichen"),
  APP_URL: z.string().min(1).default("http://localhost:3000"),
  UPLOAD_MAX_MB: z.coerce.number().int().positive().default(25),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Ungültige Konfiguration – ${details}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
```

- [ ] **Step 9: Test laufen lassen, muss bestehen**

Run: `npx vitest run tests/unit/env.test.ts`
Expected: PASS (4 Tests)

- [ ] **Step 10: npm-Scripts ergänzen** (in `package.json` → `scripts`; `dev`, `build`, `start`, `lint` aus dem Scaffold bleiben)

```json
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:e2e": "playwright test",
"db:generate": "drizzle-kit generate",
"db:migrate": "tsx --env-file=.env.local scripts/migrate.ts",
"seed:admin": "tsx --env-file=.env.local scripts/create-admin.ts",
"build:scripts": "esbuild scripts/migrate.ts scripts/create-admin.ts --bundle --platform=node --target=node24 --format=esm --outdir=dist/scripts --out-extension:.js=.mjs --external:@node-rs/argon2 --external:pg-native --banner:js=\"import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);\""
```

Run: `npm run typecheck && npm run lint`
Expected: keine Fehler.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold next.js app with dev docker and env validation"
```

---

### Task 2: Datenbank-Schema, Migrationen, Test-Harness

**Files:**
- Create: `src/lib/enums.ts`, `src/server/db/schema.ts`, `src/server/db/client.ts`, `src/server/db/order.ts`, `drizzle.config.ts`, `scripts/migrate.ts`, `tests/helpers/test-env.ts`, `tests/helpers/truncate.ts`, `tests/helpers/db.ts`, `tests/setup.ts`, `tests/global-setup.ts`, `tests/unit/db.test.ts`, `src/server/db/migrations/*` (generiert)
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `getEnv()` (Task 1)
- Produces:
  - `src/lib/enums.ts`: `GLOBAL_ROLES`, `GlobalRole`, `PROJECT_ROLES`, `ProjectRole`, `THEMES`, `Theme`, `CARD_DENSITIES`, `CardDensity`
  - `schema.ts`: Tabellen `users`, `projects`, `projectMembers`, `statuses`, `userPreferences`
  - `client.ts`: `createDb(url: string)`, `type DB`, `db(): DB` (Singleton aus `getEnv().DATABASE_URL`); `db.$client` ist der `pg.Pool`
  - `order.ts`: `byPosition(column)` → SQL-Ausdruck `column COLLATE "C"`
  - Test-Helfer: `testDb: DB`, `resetDb(): Promise<void>`, `truncateAll(pool)`, `TEST_DATABASE_URL`, `E2E_DATABASE_URL`

- [ ] **Step 1: Enums anlegen** – `src/lib/enums.ts`

```ts
export const GLOBAL_ROLES = ["admin", "member"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export const PROJECT_ROLES = ["owner", "member", "guest"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const CARD_DENSITIES = ["compact", "medium", "full"] as const;
export type CardDensity = (typeof CARD_DENSITIES)[number];
```

- [ ] **Step 2: Test-Helfer anlegen**

`tests/helpers/test-env.ts`:
```ts
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://pp:pp@localhost:5432/pp_light_test";
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://pp:pp@localhost:5432/pp_light_e2e";
```

`tests/helpers/truncate.ts`:
```ts
import type { Pool } from "pg";

export async function truncateAll(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
```

`tests/helpers/db.ts`:
```ts
import { createDb } from "@/server/db/client";
import { TEST_DATABASE_URL } from "./test-env";
import { truncateAll } from "./truncate";

export const testDb = createDb(TEST_DATABASE_URL);

export function resetDb(): Promise<void> {
  return truncateAll(testDb.$client);
}
```

`tests/setup.ts`:
```ts
import { afterAll } from "vitest";
import { testDb } from "./helpers/db";

afterAll(async () => {
  await testDb.$client.end();
});
```

`tests/global-setup.ts`:
```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../src/server/db/client";
import { TEST_DATABASE_URL } from "./helpers/test-env";

export default async function setup() {
  const db = createDb(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: "src/server/db/migrations" });
  await db.$client.end();
}
```

`vitest.config.ts` → im Block `test` ergänzen:
```ts
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    env: {
      DATABASE_URL: "postgres://pp:pp@localhost:5432/pp_light_test",
      AUTH_SECRET: "test-secret-test-secret-test-secret-123",
    },
```

- [ ] **Step 3: Fehlschlagenden Test schreiben** – `tests/unit/db.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { projects, statuses, users } from "@/server/db/schema";
import { byPosition } from "@/server/db/order";
import { resetDb, testDb } from "../helpers/db";

describe("database schema", () => {
  beforeEach(resetDb);

  it("stores a user with defaults", async () => {
    const [user] = await testDb
      .insert(users)
      .values({ email: "a@example.com", name: "A" })
      .returning();
    expect(user.role).toBe("member");
    expect(user.active).toBe(true);
    expect(user.passwordHash).toBeNull();
  });

  it("rejects duplicate project keys", async () => {
    const [user] = await testDb.insert(users).values({ email: "a@example.com", name: "A" }).returning();
    await testDb.insert(projects).values({ name: "X", key: "ABC", createdBy: user.id });
    await expect(
      testDb.insert(projects).values({ name: "Y", key: "ABC", createdBy: user.id }),
    ).rejects.toThrow();
  });

  it("orders positions bytewise regardless of database collation", async () => {
    const [user] = await testDb.insert(users).values({ email: "a@example.com", name: "A" }).returning();
    const [project] = await testDb
      .insert(projects)
      .values({ name: "X", key: "ABC", createdBy: user.id })
      .returning();
    await testDb.insert(statuses).values([
      { projectId: project.id, name: "lower", color: "#000", position: "a0" },
      { projectId: project.id, name: "upper", color: "#000", position: "Zz" },
    ]);
    const rows = await testDb.select().from(statuses).orderBy(byPosition(statuses.position));
    expect(rows.map((r) => r.name)).toEqual(["upper", "lower"]);
  });
});
```

- [ ] **Step 4: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/unit/db.test.ts`
Expected: FAIL – `Failed to resolve import "@/server/db/client"`

- [ ] **Step 5: Schema, Client, Order-Helfer, Drizzle-Config schreiben**

`src/server/db/schema.ts`:
```ts
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
```

`src/server/db/client.ts`:
```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export function createDb(url: string) {
  const pool = new Pool({ connectionString: url });
  return drizzle({ client: pool, schema });
}

export type DB = ReturnType<typeof createDb>;

let instance: DB | undefined;

export function db(): DB {
  instance ??= createDb(getEnv().DATABASE_URL);
  return instance;
}
```

`src/server/db/order.ts`:
```ts
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/** Fractional-index keys must be compared bytewise, independent of DB collation. */
export function byPosition(column: AnyPgColumn): SQL {
  return sql`${column} collate "C"`;
}
```

`drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://pp:pp@localhost:5432/pp_light",
  },
});
```

`scripts/migrate.ts`:
```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../src/server/db/client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL fehlt");
    process.exit(1);
  }
  const db = createDb(url);
  try {
    await migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? "src/server/db/migrations" });
    console.log("Migrationen ausgeführt");
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Migration generieren und auf die Dev-DB anwenden**

Run: `npm run db:generate && npm run db:migrate`
Expected: Neue Datei `src/server/db/migrations/0000_*.sql` mit `CREATE TABLE "users"` … ; Ausgabe `Migrationen ausgeführt`.

- [ ] **Step 7: Test laufen lassen, muss bestehen**

Run: `npx vitest run`
Expected: PASS – `env.test.ts` (4) und `db.test.ts` (3)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(db): add base schema, migrations and test database harness"
```

---

### Task 3: Passwörter, Users-Service, Admin-Seed

**Files:**
- Create: `src/server/errors.ts`, `src/server/auth/password.ts`, `src/server/users/service.ts`, `scripts/create-admin.ts`, `tests/unit/users.test.ts`

**Interfaces:**
- Consumes: `DB`, `users` (Task 2), `GlobalRole` (Task 2)
- Produces:
  - `errors.ts`: `type ErrorCode = "VALIDATION" | "FORBIDDEN" | "NOT_FOUND" | "KEY_TAKEN" | "EMAIL_TAKEN" | "CONFLICT"`, `class DomainError(code: ErrorCode, message: string)`, `isUniqueViolation(e: unknown): boolean`
  - `password.ts`: `hashPassword(pw: string): Promise<string>`, `verifyPassword(hash: string, pw: string): Promise<boolean>`
  - `users/service.ts`: `type User`, `normalizeEmail(email: string): string`, `createUser(db, { email, name, password?, role? }): Promise<User>`, `verifyCredentials(db, email, password): Promise<User | null>`, `findActiveUser(db, id: string): Promise<User | null>`

- [ ] **Step 1: Fehlschlagenden Test schreiben** – `tests/unit/users.test.ts`

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { users } from "@/server/db/schema";
import { createUser, findActiveUser, verifyCredentials } from "@/server/users/service";
import { resetDb, testDb } from "../helpers/db";

const PW = "geheim-passwort-1";

describe("users service", () => {
  beforeEach(resetDb);

  it("stores an argon2id hash, never the plaintext", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada", password: PW });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PW);
  });

  it("normalizes email on create and on login", async () => {
    await createUser(testDb, { email: "  Ada@Example.COM ", name: "Ada", password: PW });
    const user = await verifyCredentials(testDb, "ADA@example.com ", PW);
    expect(user?.email).toBe("ada@example.com");
  });

  it("rejects a wrong password", async () => {
    await createUser(testDb, { email: "ada@example.com", name: "Ada", password: PW });
    expect(await verifyCredentials(testDb, "ada@example.com", "falsch-falsch-1")).toBeNull();
  });

  it("rejects an unknown email", async () => {
    expect(await verifyCredentials(testDb, "nobody@example.com", PW)).toBeNull();
  });

  it("rejects users without password (e.g. SSO-only)", async () => {
    await createUser(testDb, { email: "sso@example.com", name: "Sso" });
    expect(await verifyCredentials(testDb, "sso@example.com", PW)).toBeNull();
  });

  it("rejects deactivated users", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada", password: PW });
    await testDb.update(users).set({ active: false }).where(eq(users.id, user.id));
    expect(await verifyCredentials(testDb, "ada@example.com", PW)).toBeNull();
    expect(await findActiveUser(testDb, user.id)).toBeNull();
  });

  it("reports a duplicate email as EMAIL_TAKEN", async () => {
    await createUser(testDb, { email: "ada@example.com", name: "Ada", password: PW });
    await expect(
      createUser(testDb, { email: "ADA@example.com", name: "Ada 2", password: PW }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });

  it("creates admins on request", async () => {
    const user = await createUser(testDb, { email: "root@example.com", name: "Root", password: PW, role: "admin" });
    expect(user.role).toBe("admin");
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/unit/users.test.ts`
Expected: FAIL – `Failed to resolve import "@/server/users/service"`

- [ ] **Step 3: Implementieren**

`src/server/errors.ts`:
```ts
export type ErrorCode =
  | "VALIDATION"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "KEY_TAKEN"
  | "EMAIL_TAKEN"
  | "CONFLICT";

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Postgres unique_violation (23505); Drizzle wraps driver errors in `cause`. */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === "object" && current !== null && "code" in current && current.code === "23505") {
      return true;
    }
    current = typeof current === "object" && current !== null && "cause" in current ? current.cause : undefined;
  }
  return false;
}
```

`src/server/auth/password.ts`:
```ts
import { hash, verify } from "@node-rs/argon2";

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
```

`src/server/users/service.ts`:
```ts
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { GlobalRole } from "@/lib/enums";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import type { DB } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { DomainError, isUniqueViolation } from "@/server/errors";

export type User = typeof users.$inferSelect;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(
  db: DB,
  input: { email: string; name: string; password?: string; role?: GlobalRole },
): Promise<User> {
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  try {
    const [user] = await db
      .insert(users)
      .values({
        email: normalizeEmail(input.email),
        name: input.name.trim(),
        passwordHash,
        role: input.role ?? "member",
      })
      .returning();
    return user;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DomainError("EMAIL_TAKEN", "Diese E-Mail-Adresse ist bereits vergeben.");
    }
    throw err;
  }
}

let dummyHash: Promise<string> | undefined;

/** Returns the user if email+password match an active account; null otherwise. */
export async function verifyCredentials(db: DB, email: string, password: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  if (!user || !user.passwordHash || !user.active) {
    // Same work as a real check, so response time does not reveal which emails exist.
    dummyHash ??= hashPassword("dummy-password-for-timing");
    await verifyPassword(await dummyHash, password);
    return null;
  }
  return (await verifyPassword(user.passwordHash, password)) ? user : null;
}

export async function findActiveUser(db: DB, id: string): Promise<User | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.active, true)))
    .limit(1);
  return user ?? null;
}
```

`scripts/create-admin.ts`:
```ts
import { parseArgs } from "node:util";
import { createDb } from "../src/server/db/client";
import { DomainError } from "../src/server/errors";
import { createUser } from "../src/server/users/service";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      password: { type: "string" },
    },
  });
  if (!values.email || !values.name || !values.password) {
    console.error("Aufruf: create-admin --email <mail> --name <name> --password <passwort>");
    process.exit(1);
  }
  if (values.password.length < 10) {
    console.error("Das Passwort muss mindestens 10 Zeichen haben.");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL fehlt");
    process.exit(1);
  }
  const db = createDb(url);
  try {
    const user = await createUser(db, {
      email: values.email,
      name: values.name,
      password: values.password,
      role: "admin",
    });
    console.log(`Admin angelegt: ${user.email}`);
  } catch (err) {
    if (err instanceof DomainError) {
      console.error(err.message);
      process.exitCode = 1;
    } else {
      throw err;
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run`
Expected: PASS – alle Dateien, `users.test.ts` mit 8 Tests

- [ ] **Step 5: Seed gegen die Dev-DB prüfen**

Run: `npm run seed:admin -- --email admin@example.com --name "Ada Admin" --password admin-passwort-123`
Expected: `Admin angelegt: admin@example.com`. Ein zweiter Aufruf mit denselben Daten gibt `Diese E-Mail-Adresse ist bereits vergeben.` aus und endet mit Exit-Code 1.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(users): add argon2 password hashing, users service and admin seed"
```

---

### Task 4: Rechte-Matrix

**Files:**
- Create: `src/server/permissions/index.ts`, `tests/unit/permissions.test.ts`

**Interfaces:**
- Consumes: `GlobalRole`, `ProjectRole` (Task 2), `DomainError` (Task 3)
- Produces: `type Actor = { id: string; role: GlobalRole; name: string; email: string }`, `type Action`, `ALL_ACTIONS: readonly Action[]`, `type PermissionContext = { projectRole?: ProjectRole | null; isAuthor?: boolean }`, `can(actor, action, ctx?): boolean`, `assertCan(actor, action, ctx?): void` (wirft `DomainError("FORBIDDEN")`)

- [ ] **Step 1: Fehlschlagenden Test schreiben** – `tests/unit/permissions.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { ProjectRole } from "@/lib/enums";
import { ALL_ACTIONS, assertCan, can, type Action, type Actor } from "@/server/permissions";

const member: Actor = { id: "u1", role: "member", name: "Mia", email: "mia@example.com" };
const admin: Actor = { id: "a1", role: "admin", name: "Ada", email: "ada@example.com" };

describe("can", () => {
  it("lets admins do everything, even without project membership", () => {
    for (const action of ALL_ACTIONS) expect(can(admin, action)).toBe(true);
  });

  it("lets only admins manage users", () => {
    expect(can(member, "admin.manageUsers")).toBe(false);
  });

  it("lets every user create projects", () => {
    expect(can(member, "project.create")).toBe(true);
  });

  it("denies project actions without membership", () => {
    expect(can(member, "project.view")).toBe(false);
    expect(can(member, "project.view", { projectRole: null })).toBe(false);
  });

  it.each<[ProjectRole, Action, boolean]>([
    ["owner", "project.update", true],
    ["member", "project.update", false],
    ["guest", "project.update", false],
    ["owner", "project.manageMembers", true],
    ["member", "project.manageMembers", false],
    ["owner", "task.create", true],
    ["member", "task.create", true],
    ["guest", "task.create", false],
    ["member", "task.update", true],
    ["guest", "task.update", false],
    ["guest", "project.view", true],
    ["guest", "comment.create", true],
    ["member", "attachment.upload", true],
    ["guest", "attachment.upload", false],
  ])("%s → %s = %s", (projectRole, action, expected) => {
    expect(can(member, action, { projectRole })).toBe(expected);
  });

  it("lets project members edit only their own comments", () => {
    expect(can(member, "comment.editOwn", { projectRole: "guest", isAuthor: true })).toBe(true);
    expect(can(member, "comment.editOwn", { projectRole: "owner", isAuthor: false })).toBe(false);
  });
});

describe("assertCan", () => {
  it("throws FORBIDDEN when not allowed", () => {
    expect(() => assertCan(member, "admin.manageUsers")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("passes silently when allowed", () => {
    expect(() => assertCan(member, "project.create")).not.toThrow();
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/unit/permissions.test.ts`
Expected: FAIL – `Failed to resolve import "@/server/permissions"`

- [ ] **Step 3: Implementieren** – `src/server/permissions/index.ts`

```ts
import type { GlobalRole, ProjectRole } from "@/lib/enums";
import { DomainError } from "@/server/errors";

export type Actor = { id: string; role: GlobalRole; name: string; email: string };

const PROJECT_MATRIX = {
  "project.view": ["owner", "member", "guest"],
  "project.update": ["owner"],
  "project.manageMembers": ["owner"],
  "task.create": ["owner", "member"],
  "task.update": ["owner", "member"],
  "comment.create": ["owner", "member", "guest"],
  "comment.editOwn": ["owner", "member", "guest"],
  "attachment.upload": ["owner", "member"],
} as const satisfies Record<string, readonly ProjectRole[]>;

type ProjectAction = keyof typeof PROJECT_MATRIX;
export type Action = "admin.manageUsers" | "project.create" | ProjectAction;

export const ALL_ACTIONS: readonly Action[] = [
  "admin.manageUsers",
  "project.create",
  ...(Object.keys(PROJECT_MATRIX) as ProjectAction[]),
];

export type PermissionContext = { projectRole?: ProjectRole | null; isAuthor?: boolean };

export function can(actor: Actor, action: Action, ctx: PermissionContext = {}): boolean {
  if (actor.role === "admin") return true;
  if (action === "admin.manageUsers") return false;
  if (action === "project.create") return true;

  const role = ctx.projectRole;
  if (!role) return false;
  if (!(PROJECT_MATRIX[action] as readonly ProjectRole[]).includes(role)) return false;
  if (action === "comment.editOwn") return ctx.isAuthor === true;
  return true;
}

export function assertCan(actor: Actor, action: Action, ctx: PermissionContext = {}): void {
  if (!can(actor, action, ctx)) {
    throw new DomainError("FORBIDDEN", "Dafür fehlt die Berechtigung.");
  }
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run tests/unit/permissions.test.ts`
Expected: PASS (21 Tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(permissions): add central role/permission matrix"
```

---

### Task 5: Login mit Auth.js

**Files:**
- Create: `src/lib/schemas/auth.ts`, `src/server/auth/actor.ts`, `src/server/auth/session.ts`, `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/login-form.tsx`, `src/app/(auth)/login/actions.ts`, `tests/unit/actor.test.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: `verifyCredentials`, `findActiveUser`, `createUser` (Task 3), `Actor` (Task 4), `db()` (Task 2)
- Produces:
  - `loginSchema` (zod: `{ email, password }`)
  - `resolveActor(db, userId: string | null | undefined): Promise<Actor | null>`
  - `getActor(): Promise<Actor | null>`, `requireActor(): Promise<Actor>` (leitet zu `/login` weiter)
  - `auth`, `signIn`, `signOut`, `handlers` aus `@/auth`

- [ ] **Step 1: Fehlschlagenden Test schreiben** – `tests/unit/actor.test.ts`

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import { users } from "@/server/db/schema";
import { createUser } from "@/server/users/service";
import { resetDb, testDb } from "../helpers/db";

describe("resolveActor", () => {
  beforeEach(resetDb);

  it("returns null without a user id", async () => {
    expect(await resolveActor(testDb, undefined)).toBeNull();
    expect(await resolveActor(testDb, null)).toBeNull();
  });

  it("returns null for a malformed id instead of throwing", async () => {
    expect(await resolveActor(testDb, "not-a-uuid")).toBeNull();
  });

  it("maps an active user to an actor", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada", role: "admin" });
    expect(await resolveActor(testDb, user.id)).toEqual({
      id: user.id,
      role: "admin",
      name: "Ada",
      email: "ada@example.com",
    });
  });

  it("returns null once the user is deactivated (session still valid)", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada" });
    await testDb.update(users).set({ active: false }).where(eq(users.id, user.id));
    expect(await resolveActor(testDb, user.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/unit/actor.test.ts`
Expected: FAIL – `Failed to resolve import "@/server/auth/actor"`

- [ ] **Step 3: `resolveActor` implementieren** – `src/server/auth/actor.ts`

```ts
import type { DB } from "@/server/db/client";
import type { Actor } from "@/server/permissions";
import { findActiveUser } from "@/server/users/service";

export async function resolveActor(db: DB, userId: string | null | undefined): Promise<Actor | null> {
  if (!userId) return null;
  const user = await findActiveUser(db, userId);
  return user ? { id: user.id, role: user.role, name: user.name, email: user.email } : null;
}
```

Run: `npx vitest run tests/unit/actor.test.ts` → Expected: PASS (4 Tests)

- [ ] **Step 4: Auth.js, Session-Helfer und Route anlegen**

`src/lib/schemas/auth.ts`:
```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "E-Mail fehlt"),
  password: z.string().min(1, "Passwort fehlt"),
});
```

`src/auth.ts`:
```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { loginSchema } from "@/lib/schemas/auth";
import { db } from "@/server/db/client";
import { verifyCredentials } from "@/server/users/service";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-Mail" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await verifyCredentials(db(), parsed.data.email, parsed.data.password);
        return user ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
```

`src/server/auth/session.ts`:
```ts
import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/permissions";
import { resolveActor } from "./actor";

/** Session user, re-checked against the DB on every request (deactivation takes effect immediately). */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  return resolveActor(db(), session?.user?.id);
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}
```

`src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

`next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@node-rs/argon2"],
};

export default nextConfig;
```

- [ ] **Step 5: shadcn initialisieren und Basis-Komponenten holen** (die Login-Form braucht `button`, `input`, `label`)

```bash
npx shadcn@latest init -d --base-color neutral
npx shadcn@latest add button input label textarea dialog sonner
```
Expected: `components.json`, `src/lib/utils.ts` (mit `cn`) und `src/components/ui/{button,input,label,textarea,dialog,sonner}.tsx` sind angelegt; `src/app/globals.css` enthält die shadcn-Tokens für hell und dunkel (`.dark { … }`).

- [ ] **Step 6: Login-Seite anlegen**

`src/app/(auth)/login/actions.ts`:
```ts
"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) return { error: "E-Mail oder Passwort ist falsch." };
    throw err; // NEXT_REDIRECT on success must propagate
  }
}
```

`src/app/(auth)/login/login-form.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Passwort</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        Anmelden
      </Button>
    </form>
  );
}
```

`src/app/(auth)/login/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Only an *active* user is sent on – a deactivated user with a stale cookie stays here (no loop).
  if (await getActor()) redirect("/");
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">pp_light</h1>
        <LoginForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Manuell prüfen**

Run: `npm run dev`, dann `http://localhost:3000/login` öffnen.
Expected:
- Falsches Passwort → „E-Mail oder Passwort ist falsch.“
- `admin@example.com` / `admin-passwort-123` (aus Task 3) → Weiterleitung auf `/` (vorerst die Scaffold-Startseite; in Task 8 geschützt)

Danach: `npm run typecheck && npx vitest run` → Expected: keine Fehler, alle Tests PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(auth): add credentials login with per-request active-user check"
```

---

### Task 6: Projekte-Service

**Files:**
- Create: `src/lib/schemas/project.ts`, `src/server/projects/service.ts`, `tests/unit/projects.test.ts`

**Interfaces:**
- Consumes: `DB`, Tabellen (Task 2), `byPosition` (Task 2), `DomainError`, `isUniqueViolation` (Task 3), `Actor`, `assertCan` (Task 4)
- Produces:
  - `createProjectSchema`, `type CreateProjectInput = z.input<typeof createProjectSchema>`
  - `type Project`, `type Status`, `type ProjectAccess = { project: Project; role: ProjectRole | "admin" }`
  - `createProject(db, actor, input: CreateProjectInput): Promise<Project>`
  - `listProjectsForUser(db, actor): Promise<Project[]>`
  - `getProjectForUser(db, actor, projectId: string): Promise<ProjectAccess | null>`
  - `listStatuses(db, projectId: string): Promise<Status[]>`

- [ ] **Step 1: Fehlschlagenden Test schreiben** – `tests/unit/projects.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Actor } from "@/server/permissions";
import {
  createProject,
  getProjectForUser,
  listProjectsForUser,
  listStatuses,
} from "@/server/projects/service";
import { createUser } from "@/server/users/service";
import { resetDb, testDb } from "../helpers/db";

async function actor(email: string, role: "admin" | "member" = "member"): Promise<Actor> {
  const u = await createUser(testDb, { email, name: email.split("@")[0], role });
  return { id: u.id, role: u.role, name: u.name, email: u.email };
}

describe("projects service", () => {
  beforeEach(resetDb);

  it("creates a project with normalized key, owner membership and default statuses", async () => {
    const ada = await actor("ada@example.com");
    const project = await createProject(testDb, ada, { name: "  Website-Relaunch ", key: " web " });
    expect(project.key).toBe("WEB");
    expect(project.name).toBe("Website-Relaunch");

    const access = await getProjectForUser(testDb, ada, project.id);
    expect(access?.role).toBe("owner");

    const statuses = await listStatuses(testDb, project.id);
    expect(statuses.map((s) => [s.name, s.isDone])).toEqual([
      ["Offen", false],
      ["In Arbeit", false],
      ["Review", false],
      ["Fertig", true],
    ]);
  });

  it("rejects invalid keys with a validation error", async () => {
    const ada = await actor("ada@example.com");
    await expect(createProject(testDb, ada, { name: "X", key: "1AB" })).rejects.toBeInstanceOf(ZodError);
    await expect(createProject(testDb, ada, { name: "X", key: "A" })).rejects.toBeInstanceOf(ZodError);
    await expect(createProject(testDb, ada, { name: "", key: "ABC" })).rejects.toBeInstanceOf(ZodError);
  });

  it("reports a duplicate key as KEY_TAKEN, also when created concurrently", async () => {
    const ada = await actor("ada@example.com");
    await createProject(testDb, ada, { name: "A", key: "DUP" });
    await expect(createProject(testDb, ada, { name: "B", key: "dup" })).rejects.toMatchObject({
      code: "KEY_TAKEN",
    });

    const results = await Promise.allSettled([
      createProject(testDb, ada, { name: "C", key: "RACE" }),
      createProject(testDb, ada, { name: "D", key: "RACE" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "KEY_TAKEN" });
  });

  it("lists only projects the user is a member of; admins see all", async () => {
    const ada = await actor("ada@example.com");
    const bob = await actor("bob@example.com");
    const root = await actor("root@example.com", "admin");
    await createProject(testDb, ada, { name: "Beta", key: "BET" });
    await createProject(testDb, ada, { name: "Alpha", key: "ALP" });
    await createProject(testDb, bob, { name: "Bobs", key: "BOB" });

    expect((await listProjectsForUser(testDb, ada)).map((p) => p.name)).toEqual(["Alpha", "Beta"]);
    expect((await listProjectsForUser(testDb, bob)).map((p) => p.name)).toEqual(["Bobs"]);
    expect((await listProjectsForUser(testDb, root)).map((p) => p.name)).toEqual(["Alpha", "Beta", "Bobs"]);
  });

  it("hides projects from non-members and tolerates malformed ids", async () => {
    const ada = await actor("ada@example.com");
    const bob = await actor("bob@example.com");
    const root = await actor("root@example.com", "admin");
    const project = await createProject(testDb, ada, { name: "Geheim", key: "SEC" });

    expect(await getProjectForUser(testDb, bob, project.id)).toBeNull();
    expect(await getProjectForUser(testDb, ada, "abc")).toBeNull();
    expect(await getProjectForUser(testDb, ada, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect((await getProjectForUser(testDb, root, project.id))?.role).toBe("admin");
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/unit/projects.test.ts`
Expected: FAIL – `Failed to resolve import "@/server/projects/service"`

- [ ] **Step 3: Implementieren**

`src/lib/schemas/project.ts`:
```ts
import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(100, "Höchstens 100 Zeichen"),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, "2–10 Zeichen, nur Buchstaben/Ziffern, beginnt mit einem Buchstaben"),
  description: z.string().trim().max(2000, "Höchstens 2000 Zeichen").optional().default(""),
});

export type CreateProjectInput = z.input<typeof createProjectSchema>;
```

`src/server/projects/service.ts`:
```ts
import { and, asc, eq, isNull } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import { z } from "zod";
import type { ProjectRole } from "@/lib/enums";
import { createProjectSchema, type CreateProjectInput } from "@/lib/schemas/project";
import type { DB } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { projectMembers, projects, statuses } from "@/server/db/schema";
import { DomainError, isUniqueViolation } from "@/server/errors";
import { assertCan, type Actor } from "@/server/permissions";

export type Project = typeof projects.$inferSelect;
export type Status = typeof statuses.$inferSelect;
export type ProjectAccess = { project: Project; role: ProjectRole | "admin" };

const DEFAULT_STATUSES = [
  { name: "Offen", color: "#94a3b8", isDone: false },
  { name: "In Arbeit", color: "#3b82f6", isDone: false },
  { name: "Review", color: "#a855f7", isDone: false },
  { name: "Fertig", color: "#22c55e", isDone: true },
] as const;

export async function createProject(db: DB, actor: Actor, rawInput: CreateProjectInput): Promise<Project> {
  assertCan(actor, "project.create");
  const input = createProjectSchema.parse(rawInput);
  try {
    return await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({ name: input.name, key: input.key, description: input.description, createdBy: actor.id })
        .returning();
      await tx.insert(projectMembers).values({ projectId: project.id, userId: actor.id, role: "owner" });
      const positions = generateNKeysBetween(null, null, DEFAULT_STATUSES.length);
      await tx
        .insert(statuses)
        .values(DEFAULT_STATUSES.map((s, i) => ({ ...s, projectId: project.id, position: positions[i] })));
      return project;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DomainError("KEY_TAKEN", `Das Kürzel ${input.key} ist bereits vergeben.`);
    }
    throw err;
  }
}

export async function listProjectsForUser(db: DB, actor: Actor): Promise<Project[]> {
  if (actor.role === "admin") {
    return db.select().from(projects).where(isNull(projects.archivedAt)).orderBy(asc(projects.name));
  }
  const rows = await db
    .select({ project: projects })
    .from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(and(eq(projectMembers.userId, actor.id), isNull(projects.archivedAt)))
    .orderBy(asc(projects.name));
  return rows.map((r) => r.project);
}

/** Project plus the actor's role in it; null if it does not exist or the actor may not see it. */
export async function getProjectForUser(db: DB, actor: Actor, projectId: string): Promise<ProjectAccess | null> {
  if (!z.uuid().safeParse(projectId).success) return null;
  const [row] = await db
    .select({ project: projects, role: projectMembers.role })
    .from(projects)
    .leftJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)),
    )
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) return null;
  if (row.role) return { project: row.project, role: row.role };
  if (actor.role === "admin") return { project: row.project, role: "admin" };
  return null;
}

export function listStatuses(db: DB, projectId: string): Promise<Status[]> {
  return db
    .select()
    .from(statuses)
    .where(eq(statuses.projectId, projectId))
    .orderBy(byPosition(statuses.position));
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run`
Expected: PASS – `projects.test.ts` mit 5 Tests, alle anderen weiterhin grün

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(projects): add project service with membership-scoped access"
```

---

### Task 7: Action-Result, Einstellungen, Server Actions

**Files:**
- Create: `src/server/action-result.ts`, `src/server/preferences/service.ts`, `src/app/(app)/actions.ts`, `src/app/(app)/projects/actions.ts`, `tests/unit/action-result.test.ts`, `tests/unit/preferences.test.ts`

**Interfaces:**
- Consumes: `DomainError` (Task 3), `requireActor`, `signOut` (Task 5), `createProject` (Task 6), `Theme`, `CardDensity` (Task 2)
- Produces:
  - `type ActionError = { code: string; message: string; fieldErrors?: Record<string, string[]> }`, `type ActionResult<T>`, `runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>>`
  - `type Preferences = { theme: Theme; cardDensity: CardDensity }`, `DEFAULT_PREFERENCES`, `getPreferences(db, userId): Promise<Preferences>`, `setTheme(db, userId, theme: Theme): Promise<void>`
  - Server Actions: `createProjectAction(input: CreateProjectInput): Promise<ActionResult<{ id: string }>>`, `saveThemeAction(theme: Theme): Promise<ActionResult<void>>`, `logoutAction(): Promise<void>`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`tests/unit/action-result.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runAction } from "@/server/action-result";
import { DomainError } from "@/server/errors";

describe("runAction", () => {
  it("wraps the result", async () => {
    expect(await runAction(async () => 42)).toEqual({ ok: true, data: 42 });
  });

  it("maps zod errors to VALIDATION with field errors", async () => {
    const res = await runAction(async () => z.object({ key: z.string().min(2, "zu kurz") }).parse({ key: "a" }));
    expect(res).toEqual({
      ok: false,
      error: { code: "VALIDATION", message: "Bitte Eingaben prüfen.", fieldErrors: { key: ["zu kurz"] } },
    });
  });

  it("passes domain errors through", async () => {
    const res = await runAction(async () => {
      throw new DomainError("KEY_TAKEN", "vergeben");
    });
    expect(res).toEqual({ ok: false, error: { code: "KEY_TAKEN", message: "vergeben" } });
  });

  it("hides unexpected errors behind INTERNAL and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runAction(async () => {
      throw new Error("db down: password=secret");
    });
    expect(res).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "Unerwarteter Fehler – bitte erneut versuchen." },
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
```

`tests/unit/preferences.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Theme } from "@/lib/enums";
import { DEFAULT_PREFERENCES, getPreferences, setTheme } from "@/server/preferences/service";
import { createUser } from "@/server/users/service";
import { resetDb, testDb } from "../helpers/db";

describe("preferences service", () => {
  beforeEach(resetDb);

  it("returns defaults when nothing is stored", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada" });
    expect(await getPreferences(testDb, user.id)).toEqual(DEFAULT_PREFERENCES);
  });

  it("stores and overwrites the theme", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada" });
    await setTheme(testDb, user.id, "dark");
    await setTheme(testDb, user.id, "light");
    expect(await getPreferences(testDb, user.id)).toEqual({ theme: "light", cardDensity: "medium" });
  });

  it("rejects unknown themes", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada" });
    await expect(setTheme(testDb, user.id, "pink" as Theme)).rejects.toBeInstanceOf(ZodError);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, müssen fehlschlagen**

Run: `npx vitest run tests/unit/action-result.test.ts tests/unit/preferences.test.ts`
Expected: FAIL – Imports `@/server/action-result` und `@/server/preferences/service` werden nicht gefunden

- [ ] **Step 3: Implementieren**

`src/server/action-result.ts`:
```ts
import { ZodError, z } from "zod";
import { DomainError } from "./errors";

export type ActionError = { code: string; message: string; fieldErrors?: Record<string, string[]> };
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false,
        error: {
          code: "VALIDATION",
          message: "Bitte Eingaben prüfen.",
          fieldErrors: z.flattenError(err).fieldErrors as Record<string, string[]>,
        },
      };
    }
    if (err instanceof DomainError) {
      return { ok: false, error: { code: err.code, message: err.message } };
    }
    console.error(err);
    return { ok: false, error: { code: "INTERNAL", message: "Unerwarteter Fehler – bitte erneut versuchen." } };
  }
}
```

`src/server/preferences/service.ts`:
```ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { THEMES, type CardDensity, type Theme } from "@/lib/enums";
import type { DB } from "@/server/db/client";
import { userPreferences } from "@/server/db/schema";

export type Preferences = { theme: Theme; cardDensity: CardDensity };

export const DEFAULT_PREFERENCES: Preferences = { theme: "system", cardDensity: "medium" };

export async function getPreferences(db: DB, userId: string): Promise<Preferences> {
  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return row ? { theme: row.theme, cardDensity: row.cardDensity } : DEFAULT_PREFERENCES;
}

export async function setTheme(db: DB, userId: string, theme: Theme): Promise<void> {
  const value = z.enum(THEMES).parse(theme);
  await db
    .insert(userPreferences)
    .values({ userId, theme: value })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { theme: value } });
}
```

`src/app/(app)/actions.ts`:
```ts
"use server";

import { signOut } from "@/auth";
import type { Theme } from "@/lib/enums";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { setTheme } from "@/server/preferences/service";

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

export async function saveThemeAction(theme: Theme): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(() => setTheme(db(), actor.id, theme));
}
```

`src/app/(app)/projects/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import type { CreateProjectInput } from "@/lib/schemas/project";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { createProject } from "@/server/projects/service";

export async function createProjectAction(input: CreateProjectInput): Promise<ActionResult<{ id: string }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const project = await createProject(db(), actor, input);
    revalidatePath("/", "layout");
    return { id: project.id };
  });
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run && npm run typecheck`
Expected: PASS – `action-result.test.ts` (4) und `preferences.test.ts` (3); typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add action result mapping, theme preferences and project actions"
```

---

### Task 8: App-Shell und Projektseiten

**Files:**
- Create: `src/server/projects/loaders.ts`, `src/components/shell/{sidebar,user-menu,theme-sync,project-tabs,empty-state}.tsx`, `src/components/projects/new-project-dialog.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/projects/[id]/{layout,page}.tsx`, `src/app/(app)/projects/[id]/{board,gantt,list,settings}/page.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`
- Delete: `src/app/page.tsx` (Scaffold-Startseite, wird durch `src/app/(app)/page.tsx` ersetzt)

**Interfaces:**
- Consumes: `requireActor` (Task 5), `listProjectsForUser`, `getProjectForUser`, `listStatuses`, `ProjectAccess` (Task 6), `getPreferences`, `createProjectAction`, `saveThemeAction`, `logoutAction` (Task 7), shadcn `Button`, `Input`, `Label`, `Textarea`, `Dialog*`, `Toaster` (Task 5)
- Produces: `loadProject(id: string): Promise<{ actor: Actor } & ProjectAccess>` (React-`cache`, wirft `notFound()`); Routen `/`, `/projects/[id]/{board,gantt,list,settings}`

- [ ] **Step 1: Root-Layout mit Inter, Theme-Provider und Toaster**

`src/app/page.tsx` löschen: `git rm src/app/page.tsx`

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "pp_light",
  description: "Projektplaner fürs Team",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

`src/app/globals.css`: Im Block `@theme inline` die Zeile `--font-sans: …` ersetzen durch `--font-sans: var(--font-inter);`. Die Geist-Variablen und `--font-mono: var(--font-geist-mono)` entfernen.

- [ ] **Step 2: Loader und Shell-Komponenten**

`src/server/projects/loaders.ts`:
```ts
import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getProjectForUser } from "./service";

/** Per-request cached: layout and page share one lookup. Non-members get a 404. */
export const loadProject = cache(async (id: string) => {
  const actor = await requireActor();
  const access = await getProjectForUser(db(), actor, id);
  if (!access) notFound();
  return { actor, ...access };
});
```

`src/components/shell/theme-sync.tsx`:
```tsx
"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";
import type { Theme } from "@/lib/enums";

/** Applies the theme stored for the user (e.g. chosen on another device). */
export function ThemeSync({ theme }: { theme: Theme }) {
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);
  return null;
}
```

`src/components/shell/user-menu.tsx`:
```tsx
"use client";

import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { logoutAction, saveThemeAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/lib/enums";

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Hell", Icon: Sun },
  { value: "dark", label: "Dunkel", Icon: Moon },
];

export function UserMenu({ user }: { user: { name: string; email: string } }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? theme : undefined;

  return (
    <div className="space-y-2">
      <div className="px-2 text-sm">
        <div className="truncate font-medium">{user.name}</div>
        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
      </div>
      <div role="group" aria-label="Darstellung" className="flex gap-1 px-1">
        {THEME_OPTIONS.map(({ value, label, Icon }) => (
          <Button
            key={value}
            type="button"
            size="icon"
            variant={current === value ? "secondary" : "ghost"}
            aria-label={label}
            aria-pressed={current === value}
            onClick={() => {
              setTheme(value);
              void saveThemeAction(value);
            }}
          >
            <Icon className="size-4" />
          </Button>
        ))}
      </div>
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2">
          <LogOut className="size-4" /> Abmelden
        </Button>
      </form>
    </div>
  );
}
```

`src/components/projects/new-project-dialog.tsx`:
```tsx
"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createProjectAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FieldErrors = Record<string, string[] | undefined>;

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await createProjectAction({
        name: String(form.get("name") ?? ""),
        key: String(form.get("key") ?? ""),
        description: String(form.get("description") ?? ""),
      });
      if (!res.ok) {
        if (res.error.fieldErrors) setErrors(res.error.fieldErrors);
        else if (res.error.code === "KEY_TAKEN") setErrors({ key: [res.error.message] });
        else toast.error(res.error.message);
        return;
      }
      setErrors({});
      setOpen(false);
      router.push(`/projects/${res.data.id}/board`);
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Neues Projekt
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setErrors({});
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Projekt</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field id="name" label="Name" errors={errors.name}>
              <Input id="name" name="name" maxLength={100} autoFocus />
            </Field>
            <Field id="key" label="Kürzel" hint="2–10 Zeichen, z. B. WEB – erscheint in Aufgabennummern (WEB-1)" errors={errors.key}>
              <Input id="key" name="key" maxLength={10} className="uppercase" />
            </Field>
            <Field id="description" label="Beschreibung" errors={errors.description}>
              <Textarea id="description" name="description" rows={3} />
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Anlegen
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field(props: { id: string; label: string; hint?: string; errors?: string[]; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      {props.children}
      {props.hint && !props.errors?.length && <p className="text-xs text-muted-foreground">{props.hint}</p>}
      {props.errors?.map((msg) => (
        <p key={msg} role="alert" className="text-xs text-destructive">
          {msg}
        </p>
      ))}
    </div>
  );
}
```

`src/components/shell/sidebar.tsx`:
```tsx
"use client";

import { Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";

export type SidebarProject = { id: string; name: string; key: string };

const navItem = "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent";
const navActive = "bg-accent font-medium";

export function Sidebar({ user, projects }: { user: { name: string; email: string }; projects: SidebarProject[] }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30">
      <div className="px-4 py-3 text-sm font-semibold">pp_light</div>
      <nav aria-label="Hauptnavigation" className="flex flex-1 flex-col gap-1 px-2">
        <Link href="/" className={cn(navItem, pathname === "/" && navActive)}>
          <Home className="size-4" /> Start
        </Link>
        <div className="mt-4 px-2 text-xs font-medium uppercase text-muted-foreground">Projekte</div>
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}/board`}
            className={cn(navItem, pathname.startsWith(`/projects/${p.id}`) && navActive)}
          >
            <span className="w-10 shrink-0 text-xs text-muted-foreground">{p.key}</span>
            <span className="truncate">{p.name}</span>
          </Link>
        ))}
        <NewProjectDialog />
      </nav>
      <div className="border-t p-2">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
```

`src/components/shell/project-tabs.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "board", label: "Board" },
  { slug: "gantt", label: "Gantt" },
  { slug: "list", label: "Liste" },
  { slug: "settings", label: "Einstellungen" },
] as const;

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Projektansichten" className="mt-2 flex gap-4">
      {TABS.map((tab) => {
        const href = `/projects/${projectId}/${tab.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 pb-2 text-sm",
              active ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

`src/components/shell/empty-state.tsx`:
```tsx
export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
```

- [ ] **Step 3: Geschütztes App-Layout und Startseite**

`src/app/(app)/layout.tsx`:
```tsx
import { Sidebar } from "@/components/shell/sidebar";
import { ThemeSync } from "@/components/shell/theme-sync";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getPreferences } from "@/server/preferences/service";
import { listProjectsForUser } from "@/server/projects/service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const [projects, prefs] = await Promise.all([
    listProjectsForUser(db(), actor),
    getPreferences(db(), actor.id),
  ]);
  return (
    <div className="flex min-h-svh">
      <ThemeSync theme={prefs.theme} />
      <Sidebar
        user={{ name: actor.name, email: actor.email }}
        projects={projects.map((p) => ({ id: p.id, name: p.name, key: p.key }))}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
```

`src/app/(app)/page.tsx`:
```tsx
import { EmptyState } from "@/components/shell/empty-state";

export default function HomePage() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-xl font-semibold">Meine Arbeit</h1>
      <EmptyState title="Noch keine Aufgaben" text="Lege links ein Projekt an, um loszulegen." />
    </div>
  );
}
```

- [ ] **Step 4: Projektseiten**

`src/app/(app)/projects/[id]/layout.tsx`:
```tsx
import { ProjectTabs } from "@/components/shell/project-tabs";
import { loadProject } from "@/server/projects/loaders";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { project } = await loadProject(id);
  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 pt-4">
        <h1 className="text-lg font-semibold">{project.name}</h1>
        <ProjectTabs projectId={project.id} />
      </header>
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
```

`src/app/(app)/projects/[id]/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default async function ProjectIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}/board`);
}
```

`src/app/(app)/projects/[id]/board/page.tsx`:
```tsx
import { db } from "@/server/db/client";
import { loadProject } from "@/server/projects/loaders";
import { listStatuses } from "@/server/projects/service";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await loadProject(id);
  const columns = await listStatuses(db(), project.id);
  return (
    <div className="flex gap-4 overflow-x-auto">
      {columns.map((status) => (
        <section key={status.id} aria-label={status.name} className="w-72 shrink-0 rounded-lg bg-muted/40 p-3">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
            <span className="size-2 rounded-full" style={{ backgroundColor: status.color }} />
            {status.name}
          </h2>
          <p className="text-xs text-muted-foreground">Keine Aufgaben</p>
        </section>
      ))}
    </div>
  );
}
```

`src/app/(app)/projects/[id]/gantt/page.tsx`:
```tsx
import { EmptyState } from "@/components/shell/empty-state";
import { loadProject } from "@/server/projects/loaders";

export default async function GanttPage({ params }: { params: Promise<{ id: string }> }) {
  await loadProject((await params).id);
  return <EmptyState title="Noch keine Aufgaben" text="Sobald Aufgaben Termine haben, erscheinen sie hier im Zeitplan." />;
}
```

`src/app/(app)/projects/[id]/list/page.tsx`:
```tsx
import { EmptyState } from "@/components/shell/empty-state";
import { loadProject } from "@/server/projects/loaders";

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  await loadProject((await params).id);
  return <EmptyState title="Noch keine Aufgaben" text="Aufgaben dieses Projekts erscheinen hier als Tabelle." />;
}
```

`src/app/(app)/projects/[id]/settings/page.tsx`:
```tsx
import { db } from "@/server/db/client";
import { loadProject } from "@/server/projects/loaders";
import { listStatuses } from "@/server/projects/service";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await loadProject(id);
  const columns = await listStatuses(db(), project.id);
  return (
    <div className="max-w-xl space-y-8">
      <section className="space-y-1">
        <h2 className="text-sm font-medium">Kürzel</h2>
        <p className="text-sm text-muted-foreground">{project.key}</p>
      </section>
      {project.description && (
        <section className="space-y-1">
          <h2 className="text-sm font-medium">Beschreibung</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{project.description}</p>
        </section>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Status-Spalten</h2>
        <ul className="space-y-1">
          {columns.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
              {s.isDone && <span className="text-xs text-muted-foreground">(gilt als erledigt)</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Manuell prüfen**

Run: `npm run typecheck && npm run lint && npm run dev`
Expected im Browser:
- `/` ohne Login → `/login`
- Nach dem Login: Seitenleiste mit „Start“, „Projekte“, „Neues Projekt“, Name und E-Mail, drei Theme-Buttons, „Abmelden“
- Projekt „Website-Relaunch“ mit Kürzel `web` anlegen → Weiterleitung auf `/projects/<id>/board` mit 4 Spalten; Projekt steht in der Seitenleiste als `WEB Website-Relaunch`
- Dasselbe Kürzel noch einmal → Fehler unter „Kürzel“: „Das Kürzel WEB ist bereits vergeben.“
- `/projects/abc/board` → 404-Seite
- „Dunkel“ klicken, neu laden → bleibt dunkel; „Abmelden“ → `/login`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): add app shell, sidebar, project pages and theme switching"
```

---

### Task 9: E2E-Gerüst mit Playwright

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/auth.spec.ts`, `tests/e2e/projects.spec.ts`

**Interfaces:**
- Consumes: `createDb` (Task 2), `truncateAll`, `E2E_DATABASE_URL` (Task 2), `createUser` (Task 3), UI aus Task 8 (Labels: „E-Mail“, „Passwort“, „Anmelden“, „Neues Projekt“, „Name“, „Kürzel“, „Anlegen“, „Dunkel“, „Abmelden“; Überschrift „Meine Arbeit“; Navigation „Hauptnavigation“)
- Produces: `E2E_ADMIN`, `login(page)`; `npm run test:e2e` läuft gegen die DB `pp_light_e2e` auf Port 3100

> Hinweis: Vor `npm run test:e2e` einen laufenden `npm run dev` beenden. Zwei Next-Dev-Server im selben Ordner teilen sich `.next`.

- [ ] **Step 1: Playwright-Browser installieren**

Run: `npx playwright install chromium`

- [ ] **Step 2: Konfiguration und Fixtures**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL } from "./tests/helpers/test-env";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e",
      AUTH_TRUST_HOST: "true",
      APP_URL: `http://localhost:${PORT}`,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

`tests/e2e/fixtures.ts`:
```ts
import { expect, type Page } from "@playwright/test";

export const E2E_ADMIN = {
  email: "admin@example.com",
  password: "admin-passwort-123",
  name: "Ada Admin",
};

export async function login(page: Page, email = E2E_ADMIN.email, password = E2E_ADMIN.password) {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Meine Arbeit" })).toBeVisible();
}
```

`tests/e2e/global-setup.ts`:
```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../../src/server/db/client";
import { createUser } from "../../src/server/users/service";
import { E2E_DATABASE_URL } from "../helpers/test-env";
import { truncateAll } from "../helpers/truncate";
import { E2E_ADMIN } from "./fixtures";

export default async function globalSetup() {
  const db = createDb(E2E_DATABASE_URL);
  try {
    await migrate(db, { migrationsFolder: "src/server/db/migrations" });
    await truncateAll(db.$client);
    await createUser(db, { ...E2E_ADMIN, role: "admin" });
  } finally {
    await db.$client.end();
  }
}
```

- [ ] **Step 3: Tests schreiben**

`tests/e2e/auth.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { E2E_ADMIN, login } from "./fixtures";

test("redirects anonymous users to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("shows an error for a wrong password", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Passwort").fill("falsches-passwort");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("alert")).toHaveText("E-Mail oder Passwort ist falsch.");
});

test("accepts the email in different case and logs out again", async ({ page }) => {
  await login(page, "ADMIN@Example.com");
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
```

`tests/e2e/projects.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

test("creates a project with default columns and lists it in the sidebar", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Neues Projekt" }).click();
  await page.getByLabel("Name").fill("Website-Relaunch");
  await page.getByLabel("Kürzel").fill("web");
  await page.getByRole("button", { name: "Anlegen" }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/board$/);
  await expect(page.getByRole("heading", { level: 1, name: "Website-Relaunch" })).toBeVisible();
  for (const column of ["Offen", "In Arbeit", "Review", "Fertig"]) {
    await expect(page.getByRole("region", { name: column })).toBeVisible();
  }
  await expect(
    page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: /Website-Relaunch/ }),
  ).toBeVisible();
});

test("explains a duplicate project key", async ({ page }) => {
  await login(page);
  for (const name of ["Erstes", "Zweites"]) {
    await page.getByRole("button", { name: "Neues Projekt" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Kürzel").fill("dup");
    await page.getByRole("button", { name: "Anlegen" }).click();
  }
  await expect(page.getByRole("alert")).toHaveText("Das Kürzel DUP ist bereits vergeben.");
});

test("returns 404 for an unknown project id", async ({ page }) => {
  await login(page);
  const res = await page.goto("/projects/abc/board");
  expect(res?.status()).toBe(404);
});

test("remembers the dark theme across reloads", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Dunkel" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
```

- [ ] **Step 4: E2E laufen lassen**

Run: `npm run test:e2e`
Expected: 7 passed. Wenn ein Test fehlschlägt: `npx playwright show-trace test-results/<ordner>/trace.zip` und die Ursache in der App beheben, nicht im Test. Ausnahme: Der Test widerspricht der Spec.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(e2e): add playwright setup with login and project flows"
```

---

### Task 10: Produktions-Docker

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker/entrypoint.sh`
- Modify: `next.config.ts` (`output: "standalone"`)

**Interfaces:**
- Consumes: `scripts/migrate.ts`, `scripts/create-admin.ts` (gebündelt per `npm run build:scripts`, Task 1), `MIGRATIONS_DIR` (Task 2)
- Produces: `docker compose up -d --build` startet App + Postgres. Migrationen laufen beim Start. Admin anlegen per `docker compose exec app node scripts/create-admin.mjs …`

- [ ] **Step 1: Standalone-Build aktivieren** – `next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@node-rs/argon2"],
};

export default nextConfig;
```

- [ ] **Step 2: Docker-Dateien anlegen**

`.dockerignore`:
```
node_modules
.next
dist
.git
.env*
!.env.example
.remember
test-results
playwright-report
docs
```

`Dockerfile`:
```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:scripts

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/migrations
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data/uploads && chown app:app /data/uploads
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/dist/scripts ./scripts
COPY --from=build --chown=app:app /app/src/server/db/migrations ./migrations
# argon2 loads a platform-specific native binary that output tracing may miss
COPY --from=deps --chown=app:app /app/node_modules/@node-rs ./node_modules/@node-rs
COPY --chown=app:app docker/entrypoint.sh ./entrypoint.sh
USER app
EXPOSE 3000
ENTRYPOINT ["sh", "./entrypoint.sh"]
```

`docker/entrypoint.sh`:
```sh
#!/bin/sh
set -e
node scripts/migrate.mjs
exec node server.js
```

`docker-compose.yml`:
```yaml
name: pp_light
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 2s
      retries: 30
  app:
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
    ports:
      - "3000:3000"
    volumes:
      - uploads:/data/uploads
    depends_on:
      postgres:
        condition: service_healthy
volumes:
  pgdata:
  uploads:
```

- [ ] **Step 3: Bauen und starten** (einen laufenden `npm run dev` auf Port 3000 vorher beenden)

```bash
cp .env.example .env
sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")|" .env
docker compose up -d --build --wait
docker compose logs app | head -20
```
Expected: In den Logs steht `Migrationen ausgeführt`, danach der Next-Start (`Ready`).

- [ ] **Step 4: Abnahme**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
docker compose exec app node scripts/create-admin.mjs --email admin@example.com --name "Ada Admin" --password admin-passwort-123
```
Expected: `200`, danach `Admin angelegt: admin@example.com`. Im Browser auf `http://localhost:3000` anmelden und ein Projekt anlegen; das muss funktionieren. Dann `docker compose restart app`: Die Daten bleiben, und die Migration meldet erneut Erfolg (idempotent).

Aufräumen: `docker compose down` (Volumes bleiben erhalten).

- [ ] **Step 5: Gesamte Suite und Commit**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e`
Expected: alles grün

```bash
git add -A
git commit -m "build: add production dockerfile and compose with automatic migrations"
```

---

## Abschluss M1

- Alle Unit- und E2E-Tests sind grün, `docker compose up` startet produktiv
- Danach: Plan für **M2 Aufgaben-Kern** schreiben (siehe Roadmap), auf Basis des echten Codes aus M1
