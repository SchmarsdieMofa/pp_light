import { expect, test, type Page } from "@playwright/test";
import { createProjectViaUi, E2E_MEMBER, login } from "./fixtures";

test.setTimeout(120_000);

async function openCard(page: Page, title: string) {
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByRole("dialog", { name: "Aufgabe" }).getByRole("textbox", { name: "Titel" })).toHaveValue(title);
}

async function setDate(page: Page, label: "Start" | "Fällig", value: string) {
  const field = label === "Start" ? "startDate" : "dueDate";
  const response = page.waitForResponse((item) => item.request().method() === "POST"
    && !!item.request().headers()["next-action"] && !!item.request().postData()?.includes(field)
    && !!item.request().postData()?.includes(value));
  await page.getByRole("dialog", { name: "Aufgabe" }).getByLabel(label).fill(value);
  await response;
  await page.reload();
  // The server-rendered value is visible before hydration; wait so the next fill reaches React.
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog", { name: "Aufgabe" }).getByLabel(label)).toHaveValue(value);
}

test("shows grouped tasks and saves a dragged date with dependency cascade", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Gantt-Test", "gan");
  await page.goto(board.replace(/\/board$/, "/settings"));
  await page.getByLabel("Name der neuen Phase").fill("Planung");
  await page.getByRole("button", { name: "Phase hinzufügen" }).click();
  await expect(page.getByRole("group", { name: "Phase Planung" })).toBeVisible();
  await page.goto(board);
  for (const title of ["Ausgang", "Nachfolger"]) {
    const input = page.getByLabel("Neue Aufgabe in Offen");
    await input.fill(title);
    await input.press("Enter");
    await expect(page.getByRole("region", { name: "Offen" }).getByRole("link", { name: new RegExp(title) })).toBeVisible();
  }

  const panel = page.getByRole("dialog", { name: "Aufgabe" });
  await openCard(page, "Ausgang");
  await panel.getByLabel("Phase").selectOption({ label: "Planung" });
  await setDate(page, "Start", "2026-10-01");
  await setDate(page, "Fällig", "2026-10-02");
  await panel.getByRole("link", { name: "Schließen" }).click();
  await expect(panel).toBeHidden();

  await openCard(page, "Nachfolger");
  await setDate(page, "Start", "2026-10-05");
  await setDate(page, "Fällig", "2026-10-06");
  await panel.getByRole("combobox", { name: "Blocker hinzufügen" }).selectOption({ label: "GAN-1 Ausgang" });
  await panel.getByRole("button", { name: "Hinzufügen" }).first().click();
  await expect(panel.getByRole("link", { name: /GAN-1 Ausgang/ })).toBeVisible();

  await page.goto(board.replace(/\/board$/, "/gantt"));
  await expect(page.getByRole("row", { name: "Planung" })).toBeVisible();
  await expect(page.getByRole("row", { name: /GAN-1 Ausgang/ })).toContainText("02.10.2026");
  await expect(page.getByRole("row", { name: /GAN-2 Nachfolger/ })).toContainText("06.10.2026");
  await page.getByRole("button", { name: "Tag" }).click();
  await expect(page.getByRole("button", { name: "Tag" })).toHaveAttribute("aria-pressed", "true");

  const bar = page.locator(".wx-bar.wx-task").filter({ hasText: "GAN-1 Ausgang" });
  const box = await bar.boundingBox();
  if (!box) throw new Error("Gantt-Balken nicht sichtbar");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 176, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByText("1 Aufgabe verschoben")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("row", { name: /GAN-2 Nachfolger/ })).toContainText("08.10.2026");
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByRole("row", { name: /GAN-2 Nachfolger/ })).toContainText("06.10.2026");

  const resized = await bar.boundingBox();
  if (!resized) throw new Error("Gantt-Balken nach Undo nicht sichtbar");
  await page.mouse.move(resized.x + resized.width - 6, resized.y + resized.height / 2);
  await page.mouse.down();
  await page.mouse.move(resized.x + resized.width - 6 + 176, resized.y + resized.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByRole("row", { name: /GAN-1 Ausgang/ })).toContainText("06.10.2026", { timeout: 15_000 });
  await expect(page.getByRole("row", { name: /GAN-2 Nachfolger/ })).toContainText("08.10.2026");
});

test("shows the schedule read-only for guests", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Gantt-Gast", "gga");
  const input = page.getByLabel("Neue Aufgabe in Offen");
  await input.fill("Termin");
  await input.press("Enter");
  await openCard(page, "Termin");
  await setDate(page, "Start", "2026-10-01");
  await setDate(page, "Fällig", "2026-10-02");

  await page.goto(board.replace(/\/board$/, "/settings"));
  await page.getByLabel("E-Mail des Mitglieds").fill(E2E_MEMBER.email);
  await page.getByLabel("Rolle", { exact: true }).selectOption({ label: "Gast" });
  await page.getByRole("button", { name: "Mitglied hinzufügen" }).click();
  await expect(page.getByRole("list", { name: "Mitglieder" })).toContainText(E2E_MEMBER.name);
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, E2E_MEMBER.email, E2E_MEMBER.password);
  await page.goto(board.replace(/\/board$/, "/gantt"));
  const row = page.getByRole("row", { name: /GGA-1 Termin/ });
  await expect(row).toContainText("02.10.2026");

  const bar = page.locator(".wx-bar.wx-task").filter({ hasText: "GGA-1 Termin" });
  const box = await bar.boundingBox();
  if (!box) throw new Error("Gantt-Balken nicht sichtbar");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 176, box.y + box.height / 2, { steps: 20 });
  // Read-only: the bar must not follow the pointer (an editable chart moves it before saving).
  expect((await bar.boundingBox())?.x).toBeCloseTo(box.x, 0);
  await page.mouse.up();
  await expect(page.getByText("Termin wird gespeichert…")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("row", { name: /GGA-1 Termin/ })).toContainText("02.10.2026");
});

async function ganttProject(page: Page, key: string) {
  await login(page);
  const board = await createProjectViaUi(page, `Gantt ${key}`, key);
  await page.goto(board.replace(/\/board$/, "/settings"));
  await page.getByLabel("Name der neuen Phase").fill("Planung");
  await page.getByRole("button", { name: "Phase hinzufügen" }).click();
  await expect(page.getByRole("group", { name: "Phase Planung" })).toBeVisible();
  await page.goto(board);
  for (const title of ["Eins", "Zwei"]) {
    const input = page.getByLabel("Neue Aufgabe in Offen");
    await input.fill(title);
    await input.press("Enter");
    await expect(page.getByRole("region", { name: "Offen" }).getByRole("link", { name: new RegExp(title) })).toBeVisible();
  }
  const panel = page.getByRole("dialog", { name: "Aufgabe" });
  await openCard(page, "Eins");
  await panel.getByLabel("Phase").selectOption({ label: "Planung" });
  await setDate(page, "Start", "2026-10-05");
  await setDate(page, "Fällig", "2026-10-06");
  await panel.getByRole("link", { name: "Schließen" }).click();
  await openCard(page, "Zwei");
  await setDate(page, "Start", "2026-10-07");
  await setDate(page, "Fällig", "2026-10-08");
  return board.replace(/\/board$/, "/gantt");
}

test("keeps collapsed phases when a task is opened", async ({ page }) => {
  const gantt = await ganttProject(page, "gco");
  await page.goto(gantt);
  await expect(page.getByRole("row", { name: /GCO-1 Eins/ })).toBeVisible();
  await page.getByRole("row", { name: "Planung" }).locator(".wx-toggle-icon").click();
  await expect(page.getByRole("row", { name: /GCO-1 Eins/ })).toHaveCount(0);
  await page.locator(".wx-bar.wx-task").filter({ hasText: "GCO-2 Zwei" }).click();
  await expect(page).toHaveURL(/task=/);
  await expect(page.getByRole("dialog", { name: "Aufgabe" }).getByLabel("Titel")).toHaveValue("Zwei");
  await expect(page.getByRole("row", { name: /GCO-1 Eins/ })).toHaveCount(0);
});

test("saves a drag after editing the same task in the panel without a false conflict", async ({ page }) => {
  const gantt = await ganttProject(page, "gcf");
  await page.goto(gantt);
  await page.locator(".wx-bar.wx-task").filter({ hasText: "GCF-2 Zwei" }).click();
  const panel = page.getByRole("dialog", { name: "Aufgabe" });
  await panel.getByLabel("Titel").fill("Zwei geändert");
  await panel.getByLabel("Titel").press("Enter");
  // Closing the panel is a client navigation: the chart keeps its instance and must use the fresh version.
  await panel.getByRole("link", { name: "Schließen" }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole("row", { name: /GCF-2 Zwei geändert/ })).toBeVisible();

  const bar = page.locator(".wx-bar.wx-task").filter({ hasText: "GCF-2 Zwei geändert" });
  const box = await bar.boundingBox();
  if (!box) throw new Error("Gantt-Balken nicht sichtbar");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 88, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByText("Termin gespeichert")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Die Aufgabe wurde zwischenzeitlich geändert.")).toHaveCount(0);
});

test("does not load fonts from third-party servers", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("cdn.svar.dev")) external.push(request.url());
  });
  const gantt = await ganttProject(page, "gfo");
  await page.goto(gantt);
  await expect(page.getByRole("row", { name: /GFO-1 Eins/ })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(external).toEqual([]);
});
