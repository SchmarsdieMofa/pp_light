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

export async function createProjectViaUi(page: Page, name: string, key: string): Promise<string> {
  await page.getByRole("button", { name: "Neues Projekt" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Kürzel").fill(key);
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page).toHaveURL(/\/board$/);
  return page.url();
}
