import { expect, test, type Page } from "@playwright/test";
import { createProjectViaUi, login } from "./fixtures";

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
  await expect(table.getByRole("row").nth(1)).toContainText("TSK-1");

  await table.getByRole("link", { name: "Header bauen" }).click();
  const panel = page.getByRole("complementary", { name: "Aufgabe" });
  await expect(panel.getByLabel("Titel")).toHaveValue("Header bauen");

  await panel.getByLabel("Titel").fill("Header bauen (responsive)");
  await panel.getByLabel("Titel").press("Enter");
  await panel.getByLabel("Status").selectOption({ label: "In Arbeit" });
  await panel.getByLabel("Priorität").selectOption({ label: "Hoch" });
  await panel.getByLabel("Fällig").fill("2030-01-15");

  const row = table.getByRole("row", { name: /Header bauen \(responsive\)/ });
  await expect(row).toContainText("In Arbeit");
  await expect(row).toContainText("Hoch");
  await expect(row).toContainText("15.01.2030");

  await page.goto(board);
  await expect(page.getByRole("region", { name: "In Arbeit" })).toContainText("Header bauen (responsive)");
  await expect(page.getByRole("region", { name: "Offen" })).toContainText("Footer bauen");
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
  const panel = page.getByRole("complementary", { name: "Aufgabe" });

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
  await panel.getByRole("group", { name: "Labels" }).getByLabel("Design").check();
  await expect(table.getByRole("row", { name: /Logo/ })).toContainText("Design");
  await expect(table.getByRole("row", { name: /Logo/ })).toContainText("0/1");

  await page.getByLabel("Label", { exact: true }).selectOption({ label: "Design" });
  await expect(table.getByRole("link", { name: "Logo" })).toBeVisible();
  await expect(table.getByRole("link", { name: "Impressum" })).toHaveCount(0);

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
  await expect(page.getByRole("complementary", { name: "Aufgabe" })).toContainText("Aufgabe nicht gefunden.");
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
    const panel = page.getByRole("complementary", { name: "Aufgabe" });

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
    await page.waitForLoadState("networkidle");
    await page.reload();
    const row = page.getByRole("table", { name: "Aufgaben" }).getByRole("row", { name: /Fokus/ });
    await expect(row.getByRole("cell").nth(7)).toHaveText("–");
    await row.getByRole("link", { name: "Fokus" }).click();
    await panel.getByLabel("Fällig").fill("2030-10-14");
    await expect(row).toContainText(
      "14.10.2030",
    );
    await expect(page.getByText("Bitte ein Jahr zwischen 1900 und 2999 angeben.")).toHaveCount(0);
  });
});
