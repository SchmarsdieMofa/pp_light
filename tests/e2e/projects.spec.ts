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
  await expect(page.getByRole("alert").filter({ hasText: "Das Kürzel DUP ist bereits vergeben." })).toBeVisible();
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
