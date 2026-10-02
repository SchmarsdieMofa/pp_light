import { expect, test, type Page } from "@playwright/test";
import { closeTask, createProjectViaUi, login } from "./fixtures";

async function addTaskWithDue(page: Page, board: string, title: string, due: string) {
  await page.goto(board);
  const input = page.getByLabel("Neue Aufgabe in Offen");
  await input.fill(title);
  await input.press("Enter");
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: new RegExp(title) }).click();
  const field = page.getByRole("dialog", { name: "Aufgabe" }).getByLabel("Fällig");
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().postData()?.includes(due));
  await field.fill(due);
  await field.press("Enter");
  await saved;
  await closeTask(page);
}

test("shows due tasks of several projects, filters them and reschedules by drag and drop", async ({ page }) => {
  await login(page);
  const north = await createProjectViaUi(page, "Kalender Nord", "kno");
  const south = await createProjectViaUi(page, "Kalender Süd", "ksu");
  await addTaskWithDue(page, north, "Angebot senden", "2030-01-15");
  await addTaskWithDue(page, south, "Abnahme planen", "2030-01-16");

  await page.getByRole("link", { name: "Kalender", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await page.goto("/calendar?date=2030-01-15");
  await expect(page.getByRole("heading", { name: "Januar 2030" })).toBeVisible();
  const tuesday = page.getByRole("gridcell", { name: /^Dienstag, 15\. Januar 2030/ });
  await expect(tuesday.getByRole("link", { name: /Angebot senden/ })).toBeVisible();
  await expect(page.getByRole("gridcell", { name: /^Mittwoch, 16\. Januar 2030/ }).getByRole("link", { name: /Abnahme planen/ })).toBeVisible();

  // Project filter: only "Kalender Nord".
  await page.getByText("Alle Projekte").click();
  await page.getByRole("group", { name: "Projekte" }).getByRole("checkbox", { name: /Kalender Nord/ }).check();
  await expect(page).toHaveURL(/projects=/);
  await expect(page.getByText(/^1 Aufgabe$/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Abnahme planen/ })).toHaveCount(0);
  await expect(tuesday.getByRole("link", { name: /Angebot senden/ })).toBeVisible();
  await page.getByRole("link", { name: "Filter zurücksetzen" }).click();
  await expect(page.getByRole("link", { name: /Abnahme planen/ })).toBeVisible();

  // Week view: drag to Friday sets the due date.
  await page.getByRole("link", { name: "Woche" }).click();
  await expect(page.getByRole("heading", { name: /^KW 3/ })).toBeVisible();
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().postData()?.includes("2030-01-18"));
  await page.getByRole("region", { name: "Dienstag, 15. Januar 2030" }).getByRole("link", { name: /Angebot senden/ })
    .dragTo(page.getByRole("region", { name: "Freitag, 18. Januar 2030" }));
  await saved;
  await page.reload();
  await expect(page.getByRole("region", { name: "Freitag, 18. Januar 2030" }).getByRole("link", { name: /Angebot senden/ })).toBeVisible();

  // A click opens the task overlay right in the calendar.
  await page.getByRole("region", { name: "Freitag, 18. Januar 2030" }).getByRole("link", { name: /Angebot senden/ }).click();
  await expect(page.getByRole("dialog", { name: "Aufgabe KNO-1" }).getByLabel("Fällig")).toHaveValue("18.01.2030");
  await closeTask(page);

  // The agenda lists it under its day.
  await page.getByRole("link", { name: "Liste" }).click();
  await expect(page.getByRole("region", { name: "Freitag, 18. Januar 2030" })).toContainText("Angebot senden");
});
