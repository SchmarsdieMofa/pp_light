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
  await page.getByRole("button", { name: "Alle Personen und Gruppen durchsuchen" }).click();
  const dialog = page.getByRole("dialog", { name: "Person oder Gruppe hinzufügen" });
  await dialog.getByLabel("Personen und Gruppen suchen").fill("member");
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

test("a group is part of the project: people joining or leaving it gain or lose access at once", async ({ page, browser }) => {
  await login(page);
  const settings = page.getByRole("dialog", { name: "Einstellungen" });
  await page.goto("/?settings=gruppen");
  await settings.getByLabel("Name der neuen Gruppe").fill("Team Eins");
  await settings.getByRole("button", { name: "Gruppe anlegen" }).click();
  const group = settings.getByRole("region", { name: "Gruppe Team Eins" });
  await expect(group).toBeVisible();
  await settings.getByRole("button", { name: "Schließen" }).click();

  // The (still empty) group joins the project.
  await page.goto("/");
  const board = await createProjectViaUi(page, "Gruppen-Test", "grt");
  const projectSettings = board.replace(/\/board$/, "/settings");
  await page.goto(projectSettings);
  await page.getByRole("combobox", { name: /E-Mail des Mitglieds/ }).fill("team e");
  await page.getByRole("option", { name: /Team Eins/ }).click();
  await page.getByRole("button", { name: "Gruppe hinzufügen" }).click();
  const projectGroups = page.getByRole("list", { name: "Gruppen im Projekt" });
  await expect(projectGroups).toContainText("Team Eins");
  await expect(page.getByRole("list", { name: "Mitglieder" })).not.toContainText(E2E_MEMBER.name);

  // Someone is put into the group afterwards and is in the project.
  await page.goto("/?settings=gruppen");
  await settings.getByRole("list", { name: "Gruppen", exact: true }).getByRole("button", { name: /Team Eins/ }).click();
  await group.getByRole("combobox", { name: "Person zu Team Eins hinzufügen" }).click();
  const search = page.getByRole("combobox", { name: "Name oder E-Mail suchen…" });
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.getByText("Zum Suchen Name oder E-Mail eingeben.")).toBeVisible();
  await search.fill("   ");
  await expect(page.getByRole("option")).toHaveCount(0);
  await search.fill("kein-treffer");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.getByText("Nichts gefunden.")).toBeVisible();
  await search.fill("mia");
  await expect(page.getByRole("option", { name: new RegExp(E2E_MEMBER.name) })).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(1);
  await search.fill("");
  await expect(page.getByRole("option")).toHaveCount(0);
  await search.fill(E2E_MEMBER.email);
  await expect(page.getByRole("option", { name: new RegExp(E2E_MEMBER.name) })).toBeVisible();
  await search.press("Enter");
  await expect(group.getByRole("list", { name: "Mitglieder von Team Eins" })).toContainText(E2E_MEMBER.name);
  await group.getByRole("combobox", { name: "Person zu Team Eins hinzufügen" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("option")).toHaveCount(0);
  await search.fill(E2E_MEMBER.email);
  await expect(page.getByRole("option")).toHaveCount(0);
  await search.press("Escape");
  await expect(group).toContainText("Gruppen-Test");
  await page.goto(projectSettings);
  const row = page.getByRole("list", { name: "Mitglieder" }).locator("li").filter({ hasText: E2E_MEMBER.name });
  await expect(row).toContainText("über Gruppe Team Eins");
  await expect(row.getByRole("combobox")).toHaveCount(0);

  const context = await browser.newContext();
  const mia = await context.newPage();
  await login(mia, E2E_MEMBER.email, E2E_MEMBER.password);
  expect((await mia.goto(board))?.status()).toBe(200);

  // And out again.
  await page.goto("/?settings=gruppen");
  await settings.getByRole("list", { name: "Gruppen", exact: true }).getByRole("button", { name: /Team Eins/ }).click();
  await group.getByRole("button", { name: `${E2E_MEMBER.name} aus Team Eins entfernen` }).click();
  await expect(group.getByRole("list", { name: "Mitglieder von Team Eins" })).toHaveCount(0);
  expect((await mia.goto(board))?.status()).toBe(404);
  await context.close();
});
