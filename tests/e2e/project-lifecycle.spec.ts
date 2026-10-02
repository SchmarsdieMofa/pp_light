import { expect, test } from "@playwright/test";
import { createProjectViaUi, login } from "./fixtures";

test("renames, reviews and completes a project, restores it and finally deletes it", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Lebenszyklus", "lzk");
  const input = page.getByLabel("Neue Aufgabe in Offen");
  await input.fill("Letzter Schritt");
  await input.press("Enter");
  await expect(page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Letzter Schritt/ })).toBeVisible();

  // Settings save on leaving the field.
  await page.goto(board.replace(/\/board$/, "/settings"));
  const general = page.getByRole("region", { name: "Allgemein" });
  const name = general.getByLabel("Name", { exact: true });
  await name.fill("Lebenszyklus 2026");
  await name.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Lebenszyklus 2026" })).toBeVisible();
  await general.getByLabel("Beschreibung").fill("Testprojekt für den Abschluss");
  await name.focus();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(general.getByLabel("Beschreibung")).toHaveValue("Testprojekt für den Abschluss");

  // Review: figures, open tasks, then close with a note and closing open tasks.
  await page.getByRole("link", { name: "Abschluss-Review starten" }).click();
  await expect(page.getByRole("heading", { name: "Abschluss-Review" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Offene Aufgaben (1)" })).toContainText("Letzter Schritt");
  const form = page.getByRole("form", { name: "Projekt abschließen" });
  await form.getByLabel("Abschlussnotiz (optional)").fill("Ziel erreicht.");
  await form.getByLabel("Alle als erledigt markieren").check();
  await form.getByRole("button", { name: "Projekt abschließen" }).click();
  await expect(page.getByRole("heading", { name: "Abschlussbericht" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Abschlussnotiz" })).toContainText("Ziel erreicht.");
  await expect(page.getByRole("status").filter({ hasText: "schreibgeschützt" })).toBeVisible();

  // Archived: read-only board, gone from the sidebar, listed in the archive.
  await page.goto(board);
  await expect(page.getByRole("region", { name: "Fertig" })).toContainText("Letzter Schritt");
  await expect(page.getByLabel("Neue Aufgabe in Offen")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /LZK Lebenszyklus/ })).toHaveCount(0);
  await page.goto("/projects");
  await page.getByRole("link", { name: /Archiv \(\d+\)/ }).click();
  await expect(page).toHaveURL(/\/projects\/archive$/);
  const archive = page.getByRole("list", { name: "Archivierte Projekte" });
  await expect(archive).toContainText("Lebenszyklus 2026");
  await page.getByRole("link", { name: /Abgeschlossen \d+/ }).click();
  await expect(archive).toContainText("Lebenszyklus 2026");
  await expect(archive).toContainText("Ziel erreicht.");
  await page.getByRole("link", { name: /Archiviert \d+/ }).click();
  await expect(page.getByRole("list", { name: "Archivierte Projekte" }).getByText("Lebenszyklus 2026")).toHaveCount(0);

  // Restore, then delete with the key.
  await page.goto(board.replace(/\/board$/, "/settings"));
  await page.getByRole("button", { name: "Wiederherstellen" }).click();
  await expect(page.getByRole("link", { name: "Abschluss-Review starten" })).toBeVisible();
  await expect(page.getByRole("link", { name: /LZK Lebenszyklus/ })).toBeVisible();

  await page.getByRole("button", { name: "Projekt löschen" }).click();
  const confirm = page.getByRole("dialog", { name: /endgültig löschen/ });
  await expect(confirm.getByRole("button", { name: "Endgültig löschen" })).toBeDisabled();
  await confirm.getByLabel("Kürzel zur Bestätigung").fill("lzk");
  await confirm.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByText("Lebenszyklus 2026")).toHaveCount(0);
  expect((await page.goto(board))?.status()).toBe(404);
});
