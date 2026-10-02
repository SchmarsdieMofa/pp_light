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

export async function login(page: Page, email = E2E_ADMIN.email, password = E2E_ADMIN.password) {
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
