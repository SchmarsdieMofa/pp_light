import { expect, test } from "@playwright/test";
import { createProjectViaUi, login } from "./fixtures";

test("shows all accessible projects in one overview and filters them", async ({ page }) => {
  await login(page);
  const north = await createProjectViaUi(page, "Übersicht Nord", "ovn");
  await createProjectViaUi(page, "Übersicht Süd", "ovs");

  await page.getByRole("link", { name: "Projektübersicht" }).click();
  const overview = page.getByRole("region", { name: "Projektliste" });
  await expect(overview.getByRole("heading", { name: "Übersicht Nord" })).toBeVisible();
  await expect(overview.getByRole("heading", { name: "Übersicht Süd" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Projekte suchen" }).fill("OVN");
  await page.getByRole("button", { name: "Suchen", exact: true }).click();
  await expect(overview.getByRole("heading", { name: "Übersicht Nord" })).toBeVisible();
  await expect(overview.getByRole("heading", { name: "Übersicht Süd" })).toHaveCount(0);

  await overview.getByRole("navigation", { name: "Ansichten für Übersicht Nord" }).getByRole("link", { name: "Liste" }).click();
  await expect(page).toHaveURL(north.replace(/\/board$/, "/list"));
});

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

test("folds the sidebar project list and remembers it", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Einklappen Alpha", "eka");
  await createProjectViaUi(page, "Einklappen Beta", "ekb");
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  const toggle = nav.getByRole("button", { name: /Projekte/ });

  await page.goto("/");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: /Einklappen Alpha/ })).toHaveCount(0);

  // Still folded after a reload; the open project stays reachable.
  await page.goto(board);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: /Einklappen Alpha/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Einklappen Beta/ })).toHaveCount(0);

  await toggle.click();
  await expect(nav.getByRole("link", { name: /Einklappen Beta/ })).toBeVisible();
});
