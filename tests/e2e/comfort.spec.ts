import { expect, test } from "@playwright/test";
import { createProjectViaUi, login } from "./fixtures";

test("finds assigned work, uses shortcuts and completes a task", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Komfort-Test", "kom");
  const quickAdd = page.getByLabel("Neue Aufgabe in Offen");
  await quickAdd.fill("Freigabe vorbereiten");
  await quickAdd.press("Enter");
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Freigabe vorbereiten/ }).click();

  const panel = page.getByRole("complementary", { name: "Aufgabe" });
  await panel.getByLabel("Zuständige").first().click();
  const assigned = page.waitForResponse((response) =>
    response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]),
  );
  await panel.getByRole("group", { name: "Zuständige" }).getByRole("checkbox", { name: "Ada Admin" }).check();
  await assigned;

  await page.goto("/");
  const completion = page.getByRole("checkbox", { name: "KOM-1 Freigabe vorbereiten erledigen" });
  await expect(completion).toBeVisible();

  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", { name: "Suche" });
  await search.fill("Freigabe vorbereiten");
  await expect(page.getByRole("option", { name: /Freigabe vorbereiten/ })).toBeVisible();
  await search.press("Enter");
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Titel")).toHaveValue("Freigabe vorbereiten");

  await page.goto(board);
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Tastenkürzel" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("3");
  await expect(page).toHaveURL(/\/list$/);
  await page.keyboard.press("1");
  await expect(page).toHaveURL(/\/board$/);
  await page.keyboard.press("c");
  await expect(page.getByLabel("Neue Aufgabe in Offen")).toBeFocused();
  await page.keyboard.type("2");
  await expect(page).toHaveURL(/\/board$/);

  await page.goto("/");
  const completed = page.waitForResponse((response) =>
    response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]),
  );
  await completion.click();
  await completed;
  await expect(page.getByText("KOM-1 erledigt")).toBeVisible();
  await expect(completion).toHaveCount(0);
  await page.reload();
  await expect(completion).toHaveCount(0);
  await page.goto(board);
  await expect(page.getByRole("region", { name: "Fertig" })).toContainText("Freigabe vorbereiten");
});
