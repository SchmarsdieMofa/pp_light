import { expect, test, type Page } from "@playwright/test";
import { createProjectViaUi, E2E_MEMBER, login } from "./fixtures";

test.setTimeout(120_000);

async function addCard(page: Page, title: string) {
  const input = page.getByLabel("Neue Aufgabe in Offen");
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByRole("region", { name: "Offen" }).getByRole("link", { name: new RegExp(title) })).toBeVisible();
}

async function openCard(page: Page, title: string) {
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByRole("complementary", { name: "Aufgabe" }).getByRole("textbox", { name: "Titel" })).toHaveValue(title);
}

async function closeCard(page: Page) {
  const panel = page.getByRole("complementary", { name: "Aufgabe" });
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
  await page.getByRole("complementary", { name: "Aufgabe" }).getByLabel(label).fill(value);
  await response;
  if (verifyPersisted) {
    await page.reload();
    await expect(page.getByRole("complementary", { name: "Aufgabe" }).getByLabel(label)).toHaveValue(value);
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
  const panel = page.getByRole("complementary", { name: "Aufgabe" });
  await panel.getByLabel("Phase").selectOption({ label: "Planung" });
  await setDate(page, "Start", "2026-10-01");
  await setDate(page, "Fällig", "2026-10-02");
  await expect(panel.getByLabel("Phase")).toHaveValue(/.+/);
  await closeCard(page);

  await openCard(page, "Nachfolger");
  await setDate(page, "Start", "2026-10-01");
  await setDate(page, "Fällig", "2026-10-02");
  await panel.getByRole("combobox", { name: "Blocker hinzufügen" }).selectOption({ label: "MVI-1 Ausgang" });
  await panel.getByRole("button", { name: "Hinzufügen" }).first().click();
  await expect(panel.getByRole("link", { name: /MVI-1 Ausgang/ })).toBeVisible();
  await expect(panel.getByLabel("Start")).toHaveValue("2026-10-05");
  await expect(panel.getByLabel("Fällig")).toHaveValue("2026-10-06");
  await closeCard(page);

  await openCard(page, "Ausgang");
  await setDate(page, "Fällig", "2026-10-06", false);
  await expect(page.getByText("1 Aufgabe verschoben").last()).toBeVisible();
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(panel.getByLabel("Fällig")).toHaveValue("2026-10-02");
  await closeCard(page);

  await openCard(page, "Nachfolger");
  await expect(panel.getByLabel("Start")).toHaveValue("2026-10-05");
  await expect(panel.getByLabel("Fällig")).toHaveValue("2026-10-06");
  await closeCard(page);

  await openCard(page, "Ausgang");
  await panel.getByRole("combobox", { name: "Blocker hinzufügen" }).selectOption({ label: "MVI-2 Nachfolger" });
  await panel.getByRole("button", { name: "Hinzufügen" }).first().click();
  await expect(page.getByText("Diese Abhängigkeit würde einen Zyklus erzeugen.")).toBeVisible();

  await page.goto(board.replace(/\/board$/, "/settings"));
  await page.getByLabel("E-Mail des Mitglieds").fill(E2E_MEMBER.email);
  await page.getByRole("button", { name: "Mitglied hinzufügen" }).click();
  await expect(page.getByRole("list", { name: "Mitglieder" })).toContainText(E2E_MEMBER.name);
  await page.getByRole("button", { name: "Abmelden" }).click();
  await login(page, E2E_MEMBER.email, E2E_MEMBER.password);
  await page.goto(board.replace(/\/board$/, "/settings"));
  await expect(page.getByText("Planung", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Name der neuen Phase")).toHaveCount(0);
});
