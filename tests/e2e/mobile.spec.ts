import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

test("works on a phone: drawer navigation, board and full-screen task panel", async ({ page }) => {
  await login(page);
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  await expect(nav).toBeHidden();
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await expect(nav).toBeVisible();

  await page.getByRole("button", { name: "Neues Projekt" }).click();
  await page.getByLabel("Name").fill("Mobil-Test");
  await page.getByLabel("Kürzel").fill("mob");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page).toHaveURL(/\/board$/);
  await expect(nav).toBeHidden();

  const input = page.getByLabel("Neue Aufgabe in Offen");
  await input.fill("Unterwegs prüfen");
  await input.press("Enter");
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Unterwegs prüfen/ }).click();
  const panel = page.getByRole("complementary", { name: "Aufgabe" });
  await expect(panel.getByLabel("Titel")).toHaveValue("Unterwegs prüfen");
  const box = await panel.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeLessThanOrEqual(1);
  expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 2);

  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1);
  await panel.getByRole("link", { name: "Schließen" }).click();
  await expect(panel).toBeHidden();
});
