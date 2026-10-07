import { expect, test, type Page } from "@playwright/test";
import { createProjectViaUi, E2E_MEMBER, ganttBar, ganttDayWidth, ganttRow, login, choose } from "./fixtures";
import { formatDate } from "../../src/lib/dates";

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
  await page.getByRole("dialog", { name: "Aufgabe" }).getByLabel(label).press("Enter");
  await response;
  await page.reload();
  // The server-rendered value is visible before hydration; wait so the next fill reaches React.
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog", { name: "Aufgabe" }).getByLabel(label)).toHaveValue(formatDate(value));
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
  await choose(panel.getByLabel("Phase"), "Planung");
  await setDate(page, "Start", "2026-10-01");
  await setDate(page, "Fällig", "2026-10-02");
  await panel.getByRole("link", { name: "Schließen" }).click();
  await expect(panel).toBeHidden();

  await openCard(page, "Nachfolger");
  await setDate(page, "Start", "2026-10-05");
  await setDate(page, "Fällig", "2026-10-06");
  await choose(panel.getByRole("combobox", { name: "Blocker hinzufügen" }), "GAN-1 Ausgang");
  await panel.getByRole("button", { name: "Hinzufügen" }).first().click();
  await expect(panel.getByRole("link", { name: /GAN-1 Ausgang/ })).toBeVisible();

  await page.goto(board.replace(/\/board$/, "/gantt"));
  await expect(ganttRow(page, "Planung")).toBeVisible();
  await expect(ganttRow(page, /GAN-1 Ausgang/)).toContainText("02.10.2026");
  await expect(ganttRow(page, /GAN-2 Nachfolger/)).toContainText("06.10.2026");
  await page.getByRole("button", { name: "Ansicht wählen" }).click();
  await page.getByRole("menuitem", { name: "Woche" }).click();
  await expect(page.getByRole("button", { name: "Ansicht wählen" })).toHaveText(/Woche/);
  // Week shows few, wide days – drag on the month scale so the move stays inside the viewport.
  await page.getByRole("button", { name: "Ansicht wählen" }).click();
  await page.getByRole("menuitem", { name: "Monat" }).click();
  await expect(page.getByRole("button", { name: "Ansicht wählen" })).toHaveText(/Monat/);

  const ausgang = ganttBar(page, "GAN-1 Ausgang");
  const day = await ganttDayWidth(page);
  // Keep the drag point on the visible bar, rather than behind the tree pane.
  await ausgang.scrollIntoViewIfNeeded();
  const box = await ausgang.boundingBox();
  if (!box) throw new Error("Gantt-Balken nicht sichtbar");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 4 * day, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByText("1 Aufgabe verschoben")).toBeVisible({ timeout: 15_000 });
  await expect(ganttRow(page, /GAN-2 Nachfolger/)).toContainText("08.10.2026");
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(ganttRow(page, /GAN-2 Nachfolger/)).toContainText("06.10.2026");

  // After the undo the timeline scrolls back to today; the fixed dates may lie off screen then. Put the bar at the left
  // end of the timeline: a drag that ends beyond the right edge would make the timeline scroll on by itself and
  // overshoot. Measure only once the scrolling has come to rest.
  await ausgang.evaluate((el) => el.scrollIntoView({ inline: "start", block: "nearest" }));
  await expect(async () => {
    const before = await ausgang.boundingBox();
    await page.waitForTimeout(300);
    expect(await ausgang.boundingBox()).toEqual(before);
  }).toPass();
  const resized = await ausgang.boundingBox();
  if (!resized) throw new Error("Gantt-Balken nach Undo nicht sichtbar");
  await page.mouse.move(resized.x + resized.width - 3, resized.y + resized.height / 2);
  await page.mouse.down();
  await page.mouse.move(resized.x + resized.width - 3 + 4 * day, resized.y + resized.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(ganttRow(page, /GAN-1 Ausgang/)).toContainText("06.10.2026", { timeout: 15_000 });
  await expect(ganttRow(page, /GAN-2 Nachfolger/)).toContainText("08.10.2026");
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
  await choose(page.getByLabel("Rolle", { exact: true }), "Gast");
  await page.getByRole("button", { name: "Mitglied hinzufügen" }).click();
  await expect(page.getByRole("list", { name: "Mitglieder" })).toContainText(E2E_MEMBER.name);
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, E2E_MEMBER.email, E2E_MEMBER.password);
  await page.goto(board.replace(/\/board$/, "/gantt"));
  const row = ganttRow(page, /GGA-1 Termin/);
  await expect(row).toContainText("02.10.2026");

  await expect(page.getByText("Nur Ansicht – Termine können hier nicht geändert werden.")).toBeVisible();
  const termin = ganttBar(page, "GGA-1 Termin");
  const box = await termin.boundingBox();
  if (!box) throw new Error("Gantt-Balken nicht sichtbar");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 176, box.y + box.height / 2, { steps: 20 });
  // Read-only: the bar must not follow the pointer (an editable chart moves it before saving).
  expect((await termin.boundingBox())?.x).toBeCloseTo(box.x, 0);
  await page.mouse.up();
  await expect(page.getByText("Termin wird gespeichert…")).toHaveCount(0);
  await page.reload();
  await expect(ganttRow(page, /GGA-1 Termin/)).toContainText("02.10.2026");
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
  await choose(panel.getByLabel("Phase"), "Planung");
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
  await expect(ganttRow(page, /GCO-1 Eins/)).toBeVisible();
  await ganttRow(page, "Planung").getByRole("button", { name: "Planung" }).click();
  await expect(ganttRow(page, /GCO-1 Eins/)).toHaveCount(0);
  await ganttBar(page, "GCO-2 Zwei").click();
  await expect(page).toHaveURL(/task=/);
  await expect(page.getByRole("dialog", { name: "Aufgabe" }).getByLabel("Titel")).toHaveValue("Zwei");
  await expect(ganttRow(page, /GCO-1 Eins/)).toHaveCount(0);
});

test("saves a drag after editing the same task in the panel without a false conflict", async ({ page }) => {
  const gantt = await ganttProject(page, "gcf");
  await page.goto(gantt);
  await ganttBar(page, "GCF-2 Zwei").click();
  const panel = page.getByRole("dialog", { name: "Aufgabe" });
  await panel.getByLabel("Titel").fill("Zwei geändert");
  await panel.getByLabel("Titel").press("Enter");
  // Closing the panel is a client navigation: the chart keeps its instance and must use the fresh version.
  await panel.getByRole("link", { name: "Schließen" }).click();
  await expect(panel).toBeHidden();
  await expect(ganttRow(page, /GCF-2 Zwei geändert/)).toBeVisible();

  const zwei = ganttBar(page, "GCF-2 Zwei geändert");
  const day = await ganttDayWidth(page);
  const box = await zwei.boundingBox();
  if (!box) throw new Error("Gantt-Balken nicht sichtbar");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 2 * day, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByText("Termin gespeichert")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Die Aufgabe wurde zwischenzeitlich geändert.")).toHaveCount(0);
});

test("loads nothing from third-party servers", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (!/^(https?:\/\/(localhost|127\.0\.0\.1)[:/]|data:|blob:)/.test(request.url())) external.push(request.url());
  });
  const gantt = await ganttProject(page, "gfo");
  await page.goto(gantt);
  await expect(ganttRow(page, /GFO-1 Eins/)).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(external).toEqual([]);
});
