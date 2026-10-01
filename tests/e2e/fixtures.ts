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
