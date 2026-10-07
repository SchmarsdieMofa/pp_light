import { expect, test } from "@playwright/test";
import { createProjectViaUi, dragTo, login } from "./fixtures";

test("checklist items can be renamed with a click and reordered by dragging", async ({ page }) => {
  await login(page);
  await createProjectViaUi(page, "Checklisten-Test", "chk");
  const add = page.getByLabel("Neue Aufgabe in Offen");
  await add.fill("Mit Checkliste");
  await add.press("Enter");
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Mit Checkliste/ }).click();
  const panel = page.getByRole("dialog", { name: "Aufgabe" });
  const checklist = panel.getByRole("region", { name: "Checkliste" });
  const input = checklist.getByLabel("Neuer Checklisten-Punkt");
  for (const text of ["Eins", "Zwei", "Drei"]) {
    await input.fill(text);
    await input.press("Enter");
    await expect(checklist.getByRole("button", { name: `${text} löschen` })).toBeVisible();
  }
  const texts = () => checklist.locator("li").evaluateAll((rows) => rows.map((row) => row.textContent?.trim()));

  // Click the text, edit, Enter.
  await checklist.getByRole("button", { name: "Zwei", exact: true }).click();
  await checklist.getByRole("textbox", { name: "Zwei bearbeiten" }).fill("Zwei und ein halbes");
  await page.keyboard.press("Enter");
  await expect(checklist.getByRole("button", { name: "Zwei und ein halbes", exact: true })).toBeVisible();

  // Esc drops the edit and keeps the overlay open.
  await checklist.getByRole("button", { name: "Eins", exact: true }).click();
  await checklist.getByRole("textbox", { name: "Eins bearbeiten" }).fill("Verworfen");
  await page.keyboard.press("Escape");
  await expect(checklist.getByRole("button", { name: "Eins", exact: true })).toBeVisible();
  await expect(panel).toBeVisible();

  // Drag the last item to the top.
  await dragTo(page, checklist.getByRole("button", { name: "Drei verschieben" }), checklist.locator("li").first(), "top");
  await expect.poll(texts).toEqual(["Drei", "Eins", "Zwei und ein halbes"]);

  await page.reload();
  await expect.poll(async () => {
    const list = page.getByRole("dialog", { name: "Aufgabe" }).getByRole("region", { name: "Checkliste" });
    return list.locator("li").evaluateAll((rows) => rows.map((row) => row.textContent?.trim()));
  }).toEqual(["Drei", "Eins", "Zwei und ein halbes"]);
});
