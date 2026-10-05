import { expect, test, type Page } from "@playwright/test";
import { addDays, formatDate, todayInZone } from "../../src/lib/dates";
import { closeTask, createProjectViaUi, login, choose } from "./fixtures";

async function openList(page: Page, boardUrl: string) {
  await page.goto(boardUrl.replace(/\/board$/, "/list"));
}

async function quickAdd(page: Page, title: string) {
  const input = page.getByLabel("Neue Aufgabe", { exact: true });
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByRole("table", { name: "Aufgaben" }).getByRole("link", { name: title })).toBeVisible();
}

test("creates tasks, edits them in the panel and shows them on the board", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Aufgaben-Test", "tsk");
  await openList(page, board);
  await quickAdd(page, "Header bauen");
  await quickAdd(page, "Footer bauen");

  const table = page.getByRole("table", { name: "Aufgaben" });
  // Grouped by status: the group header comes first, then its tasks.
  await expect(table.getByRole("button", { name: /Offen/ })).toHaveAttribute("aria-expanded", "true");
  await expect(table.getByRole("row").nth(2)).toContainText("TSK-1");

  await table.getByRole("link", { name: "Header bauen" }).click();
  const panel = page.getByRole("dialog", { name: "Aufgabe" });
  await expect(panel.getByLabel("Titel")).toHaveValue("Header bauen");

  await panel.getByLabel("Titel").fill("Header bauen (responsive)");
  await panel.getByLabel("Titel").press("Enter");
  await choose(panel.getByLabel("Status"), "In Arbeit");
  await choose(panel.getByLabel("Priorität"), "Hoch");
  await panel.getByLabel("Fällig").fill("2030-01-15");
  await panel.getByLabel("Fällig").press("Enter");
  await page.waitForLoadState("networkidle");
  await closeTask(page);

  // The flat list shows the status as a column.
  await page.getByRole("checkbox", { name: "Nach Status gruppieren" }).uncheck();
  await expect(page).toHaveURL(/group=none/);
  const row = table.getByRole("row", { name: /Header bauen \(responsive\)/ });
  await expect(row).toContainText("In Arbeit");
  await expect(row).toContainText("Hoch");
  await expect(row).toContainText("15.01.2030");

  await page.goto(board);
  await expect(page.getByRole("region", { name: "In Arbeit" })).toContainText("Header bauen (responsive)");
  await expect(page.getByRole("region", { name: "Offen" })).toContainText("Footer bauen");

  // From a task, both the overlay and the task page lead back to the project.
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Footer bauen/ }).click();
  const overlay = page.getByRole("dialog", { name: /Aufgabe TSK-2/ });
  await expect(overlay.getByRole("navigation", { name: "Pfad" })).toContainText("Aufgaben-Test");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await overlay.getByRole("button", { name: "Link kopieren" }).click();
  await expect(overlay.getByRole("status")).toHaveText("Kopiert");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(board).origin}/tasks/${new URL(page.url()).searchParams.get("task")}`);
  await overlay.getByRole("link", { name: "Als Seite öffnen" }).click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await page.getByRole("navigation", { name: "Pfad" }).getByRole("link", { name: "Aufgaben-Test" }).click();
  await expect(page).toHaveURL(board);
});

test("completes and reopens tasks with one click and searches live", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Haken-Test", "hak");
  await openList(page, board);
  await quickAdd(page, "Rechnung schreiben");
  await quickAdd(page, "Angebot prüfen");
  const table = page.getByRole("table", { name: "Aufgaben" });

  await table.getByRole("checkbox", { name: "HAK-1 Rechnung schreiben erledigen" }).check();
  await expect(page.getByText("HAK-1 erledigt")).toBeVisible();
  // Done tasks sit in the collapsed "Fertig" group.
  const doneGroup = table.getByRole("button", { name: /Fertig/ });
  await expect(doneGroup).toHaveAttribute("aria-expanded", "false");
  await expect(table.getByRole("link", { name: "Rechnung schreiben" })).toHaveCount(0);
  await doneGroup.click();
  await table.getByRole("checkbox", { name: "HAK-1 Rechnung schreiben wieder öffnen" }).uncheck();
  await expect(page.getByText("HAK-1 wieder geöffnet")).toBeVisible();
  await expect(table.getByRole("button", { name: /Offen/ })).toContainText("2");

  // Search filters as you type – no Enter needed.
  await page.getByLabel("Suche").fill("Angebot");
  await expect(page).toHaveURL(/q=Angebot/);
  await expect(table.getByRole("link", { name: "Rechnung schreiben" })).toHaveCount(0);
  await expect(table.getByRole("link", { name: "Angebot prüfen" })).toBeVisible();
  await page.getByRole("button", { name: "Zurücksetzen" }).click();
  await expect(table.getByRole("link", { name: "Rechnung schreiben" })).toBeVisible();
});

test("picks dates from the calendar, by quick choice or by typing", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Datum-Test", `dt${crypto.randomUUID().slice(0, 6)}`);
  await openList(page, board);
  await quickAdd(page, "Termin");
  await page.getByRole("table", { name: "Aufgaben" }).getByRole("link", { name: "Termin" }).click();
  const panel = page.getByRole("dialog", { name: "Aufgabe" });
  const due = panel.getByLabel("Fällig");
  const today = todayInZone();

  await due.locator("..").getByRole("button", { name: "Kalender öffnen" }).click();
  const picker = page.getByRole("dialog", { name: "Fällig wählen" });
  const tomorrowSaved = page.waitForResponse((response) => response.request().method() === "POST"
    && Boolean(response.request().headers()["next-action"])
    && Boolean(response.request().postData()?.includes("dueDate")));
  await picker.getByRole("button", { name: "Morgen" }).click();
  await tomorrowSaved;
  await expect(picker).toBeHidden();
  await expect(due).toHaveValue(formatDate(addDays(today, 1)));

  await panel.getByLabel("Start").locator("..").getByRole("button", { name: "Kalender öffnen" }).click();
  const startPicker = page.getByRole("dialog", { name: "Start wählen" });
  // Pick a start before tomorrow's due date; a start in the next month is correctly rejected.
  await startPicker.getByRole("button", { name: "Vorheriger Monat" }).click();
  const day = startPicker.getByRole("gridcell").getByRole("button").nth(14);
  const selectedStart = await day.getAttribute("data-day");
  expect(selectedStart).toBeTruthy();
  const startSaved = page.waitForResponse((response) => response.request().method() === "POST"
    && Boolean(response.request().headers()["next-action"])
    && Boolean(response.request().postData()?.includes("startDate")));
  await day.click();
  await startSaved;
  await expect(startPicker).toBeHidden();
  await expect(panel.getByLabel("Start")).toHaveValue(formatDate(selectedStart!));
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(panel.getByLabel("Start")).toHaveValue(formatDate(selectedStart!));

  await due.fill("24.12.");
  const typedDateSaved = page.waitForResponse((response) => response.request().method() === "POST"
    && Boolean(response.request().headers()["next-action"])
    && Boolean(response.request().postData()?.includes("dueDate")));
  await due.press("Enter");
  await typedDateSaved;
  await expect(due).toHaveValue(`24.12.${today.slice(0, 4)}`);
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Aufgabe" }).getByLabel("Fällig")).toHaveValue(`24.12.${today.slice(0, 4)}`);
});

test("manages subtasks, checklist, labels and filters", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Struktur-Test", "str");
  await page.goto(board.replace(/\/board$/, "/settings"));
  await page.getByLabel("Label-Name").fill("Design");
  await page.getByRole("button", { name: "Label hinzufügen" }).click();
  await expect(page.getByRole("button", { name: "Label Design löschen" })).toBeVisible();

  await openList(page, board);
  await quickAdd(page, "Logo");
  await quickAdd(page, "Impressum");
  const table = page.getByRole("table", { name: "Aufgaben" });
  await table.getByRole("link", { name: "Logo" }).click();
  const panel = page.getByRole("dialog", { name: "Aufgabe" });

  const subInput = panel.getByLabel("Neue Unteraufgabe");
  await subInput.fill("Entwurf");
  await subInput.press("Enter");
  await expect(panel.getByRole("region", { name: "Unteraufgaben" })).toContainText("STR-3");

  const checkInput = panel.getByLabel("Neuer Checklisten-Punkt");
  await checkInput.fill("Farben festlegen");
  await checkInput.press("Enter");
  await panel.getByRole("checkbox", { name: "Farben festlegen" }).check();
  await expect(panel.getByRole("region", { name: "Checkliste" })).toContainText("1/1");

  await panel.getByLabel("Labels").first().click();
  await panel.getByRole("group", { name: "Labels" }).getByRole("checkbox", { name: "Design" }).check();
  await page.waitForLoadState("networkidle");
  await closeTask(page);
  await expect(table.getByRole("row", { name: /Logo/ })).toContainText("Design");
  await expect(table.getByRole("row", { name: /Logo/ })).toContainText("0/1");

  await choose(page.getByLabel("Label", { exact: true }), "Design");
  await expect(table.getByRole("link", { name: "Logo" })).toBeVisible();
  await expect(table.getByRole("link", { name: "Impressum" })).toHaveCount(0);

  await table.getByRole("link", { name: "Logo" }).click();
  await panel
    .getByRole("region", { name: "Unteraufgaben" })
    .getByRole("link", { name: /Entwurf/ })
    .click();
  await expect(panel).toContainText("Teil von STR-1");
  await panel.getByRole("link", { name: "Als Seite öffnen" }).click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Titel")).toHaveValue("Entwurf");
});

test("detects concurrent edits instead of overwriting", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await login(a);
  await login(b);
  const board = await createProjectViaUi(a, "Konflikt-Test", "kon");
  await openList(a, board);
  await quickAdd(a, "Gemeinsam");
  await a.getByRole("table", { name: "Aufgaben" }).getByRole("link", { name: "Gemeinsam" }).click();
  await a.getByRole("link", { name: "Als Seite öffnen" }).click();
  await b.goto(a.url());

  await a.getByLabel("Titel").fill("Version A");
  await a.getByLabel("Titel").press("Enter");
  await expect(a.getByText("Die Aufgabe wurde zwischenzeitlich geändert.")).toHaveCount(0);
  await a.waitForLoadState("networkidle");

  await b.getByLabel("Titel").fill("Version B");
  await b.getByLabel("Titel").press("Enter");
  await expect(b.getByText("Die Aufgabe wurde zwischenzeitlich geändert.")).toBeVisible();
  await b.getByRole("button", { name: "Neu laden" }).click();
  await expect(b.getByLabel("Titel")).toHaveValue("Version A");

  await ctxA.close();
  await ctxB.close();
});

test("returns 404 for unknown task pages and tolerates bad panel ids", async ({ page }) => {
  await login(page);
  const res = await page.goto("/tasks/kaputt");
  expect(res?.status()).toBe(404);
  const board = await createProjectViaUi(page, "Fehler-Test", "err");
  await page.goto(`${board.replace(/\/board$/, "/list")}?task=kaputt&status=abc`);
  await expect(page.getByRole("dialog", { name: "Aufgabe" })).toContainText("Aufgabe nicht gefunden.");
});

test.describe("German locale", () => {
  // The segment order of <input type="date"> follows the browser locale (de: TT.MM.JJJJ).
  test.use({ locale: "de-DE" });

  test("multi-select keeps focus and closes with Escape; implausible dates are not saved", async ({ page }) => {
    await login(page);
    const board = await createProjectViaUi(page, "A11y-Test", "acc");
    await openList(page, board);
    await quickAdd(page, "Fokus");
    await page.getByRole("table", { name: "Aufgaben" }).getByRole("link", { name: "Fokus" }).click();
    const panel = page.getByRole("dialog", { name: "Aufgabe" });

    await panel.getByLabel("Zuständige").first().click();
    const box = panel.getByRole("group", { name: "Zuständige" }).getByRole("checkbox").first();
    await box.focus();
    await page.keyboard.press("Space");
    await expect(box).toBeChecked();
    await expect(box).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel.getByRole("group", { name: "Zuständige" })).toBeHidden();
    await expect(panel.locator("summary").first()).toHaveAccessibleName(/Zuständige: Ada Admin/);

    // Enter an implausible year directly: native date segment typing differs across operating systems.
    await panel.getByLabel("Fällig").fill("0202-10-14");
    await panel.getByLabel("Fällig").press("Enter");
    await expect(panel.getByLabel("Fällig")).toHaveValue("");
    await page.waitForLoadState("networkidle");
    await page.reload();
    await closeTask(page);
    const row = page.getByRole("table", { name: "Aufgaben" }).getByRole("row", { name: /Fokus/ });
    await expect(row.getByRole("cell").nth(5)).toHaveText("–");
    await row.getByRole("link", { name: "Fokus" }).click();
    await panel.getByLabel("Fällig").fill("2030-10-14");
    await panel.getByLabel("Fällig").press("Enter");
    await page.waitForLoadState("networkidle");
    await closeTask(page);
    await expect(row).toContainText(
      "14.10.2030",
    );
    await expect(page.getByText("Bitte ein Jahr zwischen 1900 und 2999 angeben.")).toHaveCount(0);
  });
});
