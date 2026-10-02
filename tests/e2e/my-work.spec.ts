import { expect, test } from "@playwright/test";
import { createProjectViaUi, login, choose } from "./fixtures";

test("captures, opens, reschedules and completes my tasks on the home page", async ({ page }) => {
  await login(page);
  await createProjectViaUi(page, "Startseite", "stp");
  await page.goto("/");
  await expect(page.getByText(/^Guten (Morgen|Tag|Abend), Ada$/)).toBeVisible();

  // Quick capture: assigned to me, due today.
  const capture = page.getByRole("form", { name: "Aufgabe für mich anlegen" });
  await choose(capture.getByLabel("Projekt"), "Startseite");
  await capture.getByRole("radio", { name: "Heute" }).click();
  await capture.getByLabel("Neue Aufgabe für mich").fill("Angebot schicken");
  await capture.getByLabel("Neue Aufgabe für mich").press("Enter");
  await expect(page.getByText("STP-1 angelegt")).toBeVisible();
  const todayGroup = page.getByRole("region", { name: "Heute" });
  await expect(todayGroup.getByRole("link", { name: /Angebot schicken/ })).toBeVisible();

  await capture.getByRole("radio", { name: "Ohne Termin" }).click();
  await capture.getByLabel("Neue Aufgabe für mich").fill("Ordner aufräumen");
  await capture.getByLabel("Neue Aufgabe für mich").press("Enter");
  const undated = page.getByRole("region", { name: "Ohne Termin" });
  await expect(undated.getByRole("link", { name: /Ordner aufräumen/ })).toBeVisible();

  // Push the undated task to tomorrow right from the row.
  await undated.getByRole("link", { name: /Ordner aufräumen/ }).hover();
  await page.getByRole("button", { name: "STP-2 auf Morgen verschieben" }).click();
  await expect(page.getByText("STP-2 auf morgen verschoben")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ordner aufräumen/ })).toContainText("Startseite");
  await expect(page.getByRole("region", { name: "Ohne Termin" })).toHaveCount(0);

  // A click opens the task overlay on the home page.
  await todayGroup.getByRole("link", { name: /Angebot schicken/ }).click();
  await expect(page.getByRole("dialog", { name: "Aufgabe STP-1" }).getByLabel("Titel")).toHaveValue("Angebot schicken");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Aufgabe STP-1" })).toHaveCount(0);

  // Complete, then undo from the toast.
  await page.getByRole("checkbox", { name: "STP-1 Angebot schicken erledigen" }).click();
  await expect(page.getByRole("link", { name: /Angebot schicken/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByRole("region", { name: "Heute" }).getByRole("link", { name: /Angebot schicken/ })).toBeVisible();
});
