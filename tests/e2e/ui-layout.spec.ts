import { expect, test, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { todayInZone, formatDate } from "../../src/lib/dates";
import { createDb } from "../../src/server/db/client";
import { notifications, projectMembers, tasks, users } from "../../src/server/db/schema";
import { createProject } from "../../src/server/projects/service";
import { createTask } from "../../src/server/tasks/service";
import { createUser } from "../../src/server/users/service";
import { E2E_DATABASE_URL } from "../helpers/test-env";
import { E2E_ADMIN, login } from "./fixtures";

const name = "Alexandra Katharina von Hohenlohe-Waldenburg-Schillingsfürst";
const title = "Eine Aufgabe mit einem sehr langen Titel für die Kontrolle von Dialogen, Listen und Kalenderkarten";
const message = "Benachrichtigung: " + "Donaudampfschifffahrtsgesellschaftskapitän".repeat(8);
let email: string;
let projectId: string;
let taskId: string;

test.beforeAll(async () => {
  const db = createDb(E2E_DATABASE_URL);
  try {
    const [admin] = await db.select().from(users).where(eq(users.email, E2E_ADMIN.email));
    email = `alexandra.katharina.von.hohenlohe-${crypto.randomUUID().slice(0, 8)}@department.example.invalid`;
    const member = await createUser(db, { email, name });
    await db.update(users).set({ active: false }).where(eq(users.id, member.id));
    const project = await createProject(db, admin, { name: "Prüfung langer Texte", key: `UI${crypto.randomUUID().slice(0, 6)}` });
    projectId = project.id;
    await db.insert(projectMembers).values({ projectId, userId: member.id, role: "member" });
    const task = await createTask(db, admin, { projectId, title });
    taskId = task.id;
    await db.update(tasks).set({ dueDate: todayInZone() }).where(eq(tasks.id, taskId));
    await db.insert(notifications).values({ userId: admin.id, type: "assigned", message, eventKey: crypto.randomUUID() });
  } finally {
    await db.$client.end();
  }
});

async function fitsPage(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

async function wrapsWithoutClipping(text: Locator) {
  await expect(text).toBeVisible();
  expect(await text.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await text.evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe("ellipsis");
}

test("user identities, settings tabs and actions fit desktop and phone screens", async ({ page }) => {
  await login(page);
  for (const width of [1366, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?settings=nutzer");
    const dialog = page.getByRole("dialog", { name: "Einstellungen" });
    const row = dialog.getByRole("list", { name: "Nutzer", exact: true }).locator("li").filter({ hasText: email });
    await wrapsWithoutClipping(row.getByText(name, { exact: true }));
    await wrapsWithoutClipping(row.getByText(email, { exact: true }));
    const bounds = await dialog.boundingBox();
    const controls = row.locator("button").or(dialog.getByRole("navigation", { name: "Einstellungsbereiche" }).getByRole("link"));
    for (const control of await controls.all()) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    }
    await row.getByRole("button", { name: "Einladung zurückziehen", exact: true }).scrollIntoViewIfNeeded();
    await expect(row.getByRole("button", { name: "Einladung zurückziehen", exact: true })).toBeInViewport();
    await fitsPage(page);
  }
});

test("long project members, task titles and list columns remain readable on phones", async ({ page }) => {
  await login(page);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/projects/${projectId}/settings`);
    const row = page.getByRole("list", { name: "Mitglieder", exact: true }).locator("li").filter({ hasText: email });
    await wrapsWithoutClipping(row.getByText(name, { exact: true }));
    await wrapsWithoutClipping(row.getByText(email, { exact: true }));
    await fitsPage(page);
    await page.goto(`/projects/${projectId}/review`);
    await wrapsWithoutClipping(page.getByRole("region", { name: "Beiträge", exact: true }).locator("li > span").filter({ hasText: name }));
    await fitsPage(page);
    for (const suffix of ["", "?group=none"]) {
      await page.goto(`/projects/${projectId}/list${suffix}`);
      const table = page.getByRole("table", { name: "Aufgaben", exact: true });
      const link = table.getByRole("link", { name: title, exact: true });
      await expect(link).toBeVisible();
      expect((await link.boundingBox())!.width).toBeGreaterThan(80);
      await expect(table.getByRole("cell").filter({ hasText: formatDate(todayInZone()) })).toBeInViewport();
      await fitsPage(page);
    }
    await page.goto(`/projects/${projectId}/board?task=${taskId}`);
    const field = page.getByRole("dialog", { name: /Aufgabe/ }).getByLabel("Titel", { exact: true });
    await expect(field).toHaveValue(title);
    expect(await field.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await field.fill(title + " geändert");
    const saved = page.waitForResponse((response) => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]));
    await field.press("Enter");
    await saved;
    await page.reload();
    await expect(field).toHaveValue(title + " geändert");
    await field.fill(title);
    const restored = page.waitForResponse((response) => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]));
    await field.press("Enter");
    await restored;
  }
});

test("notification text and short-screen dialogs stay inside the viewport", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/inbox");
  await expect(page.getByText(message, { exact: true }).first()).toBeVisible();
  await fitsPage(page);
  for (const control of await page.locator("main button").all()) {
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto("/");
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("button", { name: "Neues Projekt", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Neues Projekt", exact: true });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(360);
  await dialog.getByLabel("Beschreibung").fill("Eine lange Beschreibung.\n".repeat(30));
  await dialog.getByRole("button", { name: "Anlegen", exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Anlegen", exact: true })).toBeInViewport();
});

test("own long email wraps in account settings", async ({ page }) => {
  const ownEmail = `alexandra.katharina.von.hohenlohe-${crypto.randomUUID().slice(0, 8)}@department.example.invalid`;
  const password = "LangesPasswort123!";
  const db = createDb(E2E_DATABASE_URL);
  try {
    await createUser(db, { email: ownEmail, name, password });
  } finally {
    await db.$client.end();
  }
  await login(page, ownEmail, password);
  for (const width of [1366, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?settings=konto");
    await wrapsWithoutClipping(page.getByRole("dialog", { name: "Einstellungen" }).getByText(ownEmail, { exact: true }));
    await fitsPage(page);
  }
});
