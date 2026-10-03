import { expect, type Locator, type Page } from "@playwright/test";

export const E2E_ADMIN = {
  email: "admin@example.com",
  password: "admin-passwort-123",
  name: "Ada Admin",
};

export const E2E_MEMBER = {
  email: "mia@example.com",
  password: "mia-passwort-1234",
  name: "Mia Member",
};

/** New accounts get the welcome tour after their first login; tests about other things just skip it when it is in the way. */
export async function skipWelcome(page: Page) {
  const welcome = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Überspringen" }) });
  await page.addLocatorHandler(welcome, (dialog) => dialog.getByRole("button", { name: "Überspringen" }).click());
}

export async function login(page: Page, email = E2E_ADMIN.email, password = E2E_ADMIN.password) {
  await skipWelcome(page);
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Meine Arbeit" })).toBeVisible();
}

export async function createProjectViaUi(page: Page, name: string, key: string): Promise<string> {
  await page.getByRole("button", { name: "Neues Projekt" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Kürzel").fill(key);
  await page.getByRole("button", { name: "Anlegen" }).click();
  // Wait for the new project itself: when already on another board, the URL alone matches at once.
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page).toHaveURL(/\/board$/);
  return page.url();
}

/** Pointer drag in small steps so dnd-kit's 5px activation constraint and collision detection kick in. */
export async function dragTo(page: Page, source: Locator, target: Locator, position: "center" | "top" = "center") {
  // Cards slide (CSS transitions) after the previous move – measure only once they stand still.
  await expect(async () => {
    const a = await source.boundingBox();
    await page.waitForTimeout(150);
    const b = await source.boundingBox();
    expect(a?.y).toBe(b?.y);
  }).toPass();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("drag source/target not visible");
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 8, startY + 8, { steps: 4 });
  const endY = position === "top" ? to.y + 4 : to.y + to.height / 2;
  await page.mouse.move(to.x + to.width / 2, endY, { steps: 20 });
  await page.mouse.up();
}

/** Closes the task overlay; while it is open the view behind it is inert. */
export async function closeTask(page: Page) {
  const overlay = page.getByRole("dialog", { name: "Aufgabe" });
  await overlay.getByRole("link", { name: "Schließen" }).click();
  await expect(overlay).toBeHidden();
}

/** Picks an entry in one of the app's dropdowns (`<Select>`), which open a listbox in a popup. */
export async function choose(trigger: Locator, option: string) {
  await trigger.click();
  const escaped = option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await trigger.page().getByRole("option", { name: new RegExp(`^${escaped}`) }).first().click();
}

/** A row of the gantt's tree panel (name, start, due, hint). */
export function ganttRow(page: Page, name: string | RegExp) {
  return page.locator('[data-slot="gantt-tree-pane"] [data-slot="gantt-row-group"]').filter({ hasText: name });
}

/** A bar on the timeline; its accessible name starts with the bar title. */
export function ganttBar(page: Page, title: string) {
  return page.locator(`[data-slot="gantt-bar"][aria-label^="${title}"]`).first();
}

/** Width of one day on a day-unit scale (week, month): the most common gap between the timeline's grid lines. */
export async function ganttDayWidth(page: Page) {
  await expect(page.locator('[data-slot="gantt-grid-line"]').first()).toBeVisible();
  const xs = await page.locator('[data-slot="gantt-grid-line"]').evaluateAll((lines) =>
    lines.map((line) => Math.round(line.getBoundingClientRect().x)).sort((a, b) => a - b));
  const gaps = xs.slice(1).map((x, i) => x - xs[i]).filter((gap) => gap > 0).sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}
