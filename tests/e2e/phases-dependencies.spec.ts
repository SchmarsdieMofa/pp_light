import { expect, test, type Page } from "@playwright/test";
import { createProjectViaUi, E2E_MEMBER, login, choose } from "./fixtures";
import { formatDate } from "../../src/lib/dates";

test.setTimeout(120_000);

async function addCard(page: Page, title: string) {
  const input = page.getByLabel("Neue Aufgabe in Offen");
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByRole("region", { name: "Offen" }).getByRole("link", { name: new RegExp(title) })).toBeVisible();
}

async function openCard(page: Page, title: string) {
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByRole("dialog", { name: "Aufgabe" }).getByRole("textbox", { name: "Titel" })).toHaveValue(title);
}

async function closeCard(page: Page) {
  const panel = page.getByRole("dialog", { name: "Aufgabe" });
  await panel.getByRole("link", { name: "Schließen" }).click();
  await expect(panel).toBeHidden();
}

async function setDate(page: Page, label: "Start" | "Fällig", value: string, verifyPersisted = true) {
  const field = label === "Start" ? "startDate" : "dueDate";
  const response = page.waitForResponse((item) => {
    const request = item.request();
    return request.method() === "POST" && !!request.headers()["next-action"]
      && !!request.postData()?.includes(field) && !!request.postData()?.includes(value);
  });
  await page.getByRole("dialog", { name: "Aufgabe" }).getByLabel(label).fill(value);
  await page.getByRole("dialog", { name: "Aufgabe" }).getByLabel(label).press("Enter");
  await response;
  if (verifyPersisted) {
    await page.reload();
    // The server-rendered value is visible before hydration; wait so the next fill reaches React.
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("dialog", { name: "Aufgabe" }).getByLabel(label)).toHaveValue(formatDate(value));
  }
}

test("manages phases and cascades a dependency with undo", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "M4-Vorschau", "mvi");
  await page.goto(board.replace(/\/board$/, "/settings"));
  await page.getByLabel("Name der neuen Phase").fill("Planung");
  await page.getByRole("button", { name: "Phase hinzufügen" }).click();
  await expect(page.getByRole("group", { name: "Phase Planung" })).toBeVisible();
  await page.getByLabel("Name der neuen Phase").fill("Freigabe");
  await page.getByLabel("Start der neuen Phase").fill("2026-10-09");
  await page.getByRole("checkbox", { name: "Meilenstein" }).last().check();
  await page.getByRole("button", { name: "Phase hinzufügen" }).click();
  await expect(page.getByRole("group", { name: "Phase Freigabe" })).toBeVisible();

  await page.goto(board);
  await addCard(page, "Ausgang");
  await addCard(page, "Nachfolger");
  await openCard(page, "Ausgang");
  const panel = page.getByRole("dialog", { name: "Aufgabe" });
  await choose(panel.getByLabel("Phase"), "Planung");
  await setDate(page, "Start", "2026-10-01");
  await setDate(page, "Fällig", "2026-10-02");
  await expect(panel.getByLabel("Phase")).toHaveText("Planung");
  await closeCard(page);

  await openCard(page, "Nachfolger");
  await setDate(page, "Start", "2026-10-01");
  await setDate(page, "Fällig", "2026-10-02");
  await choose(panel.getByRole("combobox", { name: "Blocker hinzufügen" }), "MVI-1 Ausgang");
  await panel.getByRole("button", { name: "Hinzufügen" }).first().click();
  await expect(panel.getByRole("link", { name: /MVI-1 Ausgang/ })).toBeVisible();
  await expect(panel.getByLabel("Start")).toHaveValue("05.10.2026");
  await expect(panel.getByLabel("Fällig")).toHaveValue("06.10.2026");
  await closeCard(page);

  await openCard(page, "Ausgang");
  await setDate(page, "Fällig", "2026-10-06", false);
  await expect(page.getByText("1 Aufgabe verschoben").last()).toBeVisible();
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(panel.getByLabel("Fällig")).toHaveValue("02.10.2026");
  await closeCard(page);

  await openCard(page, "Nachfolger");
  await expect(panel.getByLabel("Start")).toHaveValue("05.10.2026");
  await expect(panel.getByLabel("Fällig")).toHaveValue("06.10.2026");
  await closeCard(page);

  await openCard(page, "Ausgang");
  await choose(panel.getByRole("combobox", { name: "Blocker hinzufügen" }), "MVI-2 Nachfolger");
  await panel.getByRole("button", { name: "Hinzufügen" }).first().click();
  await expect(page.getByText("Diese Abhängigkeit würde einen Zyklus erzeugen.")).toBeVisible();

  await page.goto(board.replace(/\/board$/, "/settings"));
  await page.getByLabel("E-Mail des Mitglieds").fill(E2E_MEMBER.email);
  await page.getByRole("button", { name: "Mitglied hinzufügen" }).click();
  await expect(page.getByRole("list", { name: "Mitglieder" })).toContainText(E2E_MEMBER.name);
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, E2E_MEMBER.email, E2E_MEMBER.password);
  await page.goto(board.replace(/\/board$/, "/settings"));
  await expect(page.getByText("Planung", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Name der neuen Phase")).toHaveCount(0);
});
