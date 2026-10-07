import { expect, test } from "@playwright/test";
import { createProjectViaUi, login } from "./fixtures";

test("a long task can be scrolled with the wheel down to the file upload", async ({ page }) => {
  await login(page);
  await createProjectViaUi(page, "Scroll Projekt", "scr");
  const add = page.getByLabel("Neue Aufgabe in Offen");
  await add.fill("Lange Aufgabe");
  await add.press("Enter");
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Lange Aufgabe/ }).click();
  const panel = page.getByRole("dialog", { name: "Aufgabe" });
  const item = panel.getByLabel("Neuer Checklisten-Punkt");
  for (let i = 1; i <= 14; i++) {
    await item.fill(`Punkt ${i}`);
    await item.press("Enter");
    await expect(panel.getByText(`Punkt ${i}`, { exact: true })).toBeVisible();
  }
  const upload = panel.getByLabel("Datei hochladen");
  await expect(upload).toBeAttached();

  // A real wheel over the content, not a programmatic scrollIntoView.
  const box = (await panel.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 4000);
  await expect.poll(() => panel.evaluate((el) => [...el.querySelectorAll("*")].some((n) => n.scrollTop > 0))).toBe(true);
});
