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
  // Next.js also renders a (usually empty) route announcer with role="alert" – match by text.
  await expect(page.getByRole("alert").filter({ hasText: "E-Mail oder Passwort ist falsch." })).toBeVisible();
});

test("accepts the email in different case and logs out again", async ({ page }) => {
  await login(page, "ADMIN@Example.com");
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
