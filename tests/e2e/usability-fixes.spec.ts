import { expect, test } from "@playwright/test";
import { createProjectViaUi, E2E_MEMBER, login } from "./fixtures";

test("sidebar order: Archiv sits at the bottom, Suchen comes before Kalender", async ({ page }) => {
  await login(page);
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  const labels = await nav.locator("a, button").evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ""));
  const order = ["Start", "Projektübersicht", "Suchen", "Kalender", "Benachrichtigungen"];
  const positions = order.map((label) => labels.findIndex((text) => text.startsWith(label)));
  expect(positions.every((p) => p >= 0)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  expect(labels.some((text) => text.startsWith("Archiv"))).toBe(false);
  const archive = page.getByRole("complementary").getByRole("link", { name: "Archiv" });
  const user = page.getByRole("complementary").getByRole("link", { name: "Einstellungen" });
  const [a, u] = [await archive.boundingBox(), await user.boundingBox()];
  expect(a!.y).toBeLessThan(u!.y);
});

test("calendar navigation buttons keep their position across months", async ({ page }) => {
  await login(page);
  await page.goto("/calendar?date=2026-05-10");
  const next = page.getByRole("link", { name: "Weiter" });
  const before = await next.boundingBox();
  await page.goto("/calendar?date=2026-09-10");
  const after = await next.boundingBox();
  expect(Math.round(after!.x)).toBe(Math.round(before!.x));
});

test("subtasks show up on the board and in the list; member picker suggests people while typing", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Fix-Test", "fix");
  await page.getByLabel("Neue Aufgabe in Offen").fill("Hauptaufgabe");
  await page.getByLabel("Neue Aufgabe in Offen").press("Enter");
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Hauptaufgabe/ }).click();
  const panel = page.getByRole("dialog", { name: "Aufgabe" });
  await panel.getByLabel("Neue Unteraufgabe").fill("Teilschritt");
  await panel.getByLabel("Neue Unteraufgabe").press("Enter");
  await expect(panel.getByRole("region", { name: "Unteraufgaben" })).toContainText("Teilschritt");
  await panel.getByRole("link", { name: "Schließen" }).click();

  const sub = page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Teilschritt/ });
  await expect(sub).toBeVisible();
  await expect(sub).toContainText("Hauptaufgabe");
  await page.goto(board.replace(/\/board$/, "/list"));
  await expect(page.getByRole("table", { name: "Aufgaben" }).getByRole("link", { name: "Teilschritt" })).toBeVisible();

  await page.goto(board.replace(/\/board$/, "/settings"));
  const picker = page.getByRole("combobox", { name: /E-Mail des Mitglieds/ });
  await expect(page.getByRole("listbox", { name: "Vorschläge" })).toHaveCount(0);
  await picker.fill("mia");
  const suggestion = page.getByRole("option", { name: new RegExp(E2E_MEMBER.name) });
  await expect(suggestion).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(1);
  await suggestion.click();
  await expect(picker).toHaveValue(E2E_MEMBER.email);

  await picker.fill("");
  await page.getByRole("button", { name: "Alle Personen durchsuchen" }).click();
  const dialog = page.getByRole("dialog", { name: "Person hinzufügen" });
  await dialog.getByLabel("Personen suchen").fill("member");
  await dialog.getByRole("button", { name: new RegExp(E2E_MEMBER.name) }).click();
  await expect(picker).toHaveValue(E2E_MEMBER.email);
});

test("an admin who is not a member can neither list nor open a project", async ({ page, browser }) => {
  await login(page, E2E_MEMBER.email, E2E_MEMBER.password);
  const board = await createProjectViaUi(page, "Nur für Mia", "mia");

  const admin = await browser.newPage();
  await login(admin);
  await admin.goto("/projects");
  await expect(admin.getByRole("link", { name: /Nur für Mia/ })).toHaveCount(0);
  const response = await admin.goto(board);
  expect(response?.status()).toBe(404);
  await admin.close();
});
