import { expect, test } from "@playwright/test";
import { createProjectViaUi, login } from "./fixtures";

test("question marks explain a field on hover and on keyboard focus", async ({ page }) => {
  await login(page);
  await createProjectViaUi(page, "Hinweis-Test", "hin");
  const add = page.getByLabel("Neue Aufgabe in Offen");
  await add.fill("Erklär mich");
  await add.press("Enter");
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Erklär mich/ }).click();
  const panel = page.getByRole("dialog", { name: "Aufgabe" });

  await panel.locator('[data-hint="Was bedeutet Phase?"]').hover();
  await expect(page.getByText("Ordnet die Aufgabe einem Projektabschnitt zu")).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(page.getByText("Ordnet die Aufgabe einem Projektabschnitt zu")).toHaveCount(0);

  // Keyboard: focus the question mark, Enter opens it, Esc closes only the hint (not the task).
  await panel.locator('[data-hint="Was ist eine Checkliste?"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Kleine Schritte innerhalb dieser Aufgabe")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Kleine Schritte innerhalb dieser Aufgabe")).toHaveCount(0);
  await expect(panel).toBeVisible();
});
