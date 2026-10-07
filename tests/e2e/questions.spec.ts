import { expect, test } from "@playwright/test";
import { choose, createProjectViaUi, E2E_MEMBER, login } from "./fixtures";

test("a question is asked, answered by a guest, closed with a summary and reopened", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await login(page);
  const board = await createProjectViaUi(page, "Fragen-Test", "frq");
  await page.goto(board.replace(/\/board$/, "/settings"));
  await page.getByLabel("E-Mail des Mitglieds").fill(E2E_MEMBER.email);
  await choose(page.getByLabel("Rolle", { exact: true }), "Gast");
  await page.getByRole("button", { name: "Mitglied hinzufügen" }).click();
  await expect(page.getByRole("list", { name: "Mitglieder" })).toContainText(E2E_MEMBER.name);

  // Own tab, empty at first.
  await page.getByRole("navigation", { name: "Projektansichten" }).getByRole("link", { name: "Fragen" }).click();
  await expect(page.getByText("Keine offenen Fragen")).toBeVisible();

  // Ask: the new question opens as overlay.
  await page.getByRole("button", { name: "Frage stellen" }).click();
  const ask = page.getByRole("dialog", { name: "Frage stellen" });
  await ask.getByLabel("Titel").fill("Welche Farbe für das Logo?");
  await ask.getByLabel("Fragetext").fill("Blau oder grün – was passt zur Marke?");
  await ask.getByRole("button", { name: "Frage stellen" }).click();
  const overlay = page.getByRole("dialog", { name: "Frage", exact: true });
  await expect(overlay.getByRole("textbox", { name: "Titel der Frage" })).toHaveValue("Welche Farbe für das Logo?");
  await expect(overlay.getByText("Blau oder grün – was passt zur Marke?")).toBeVisible();
  await expect(page).toHaveURL(/frage=/);
  const questionUrl = page.url();
  // The tab counts open questions (the view behind the overlay is inert, so look it up by its link).
  await expect(page.locator('nav[aria-label="Projektansichten"] a[href$="/questions"]')).toContainText("1");

  // A guest of the project answers, and the asker hears about it.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await login(guest, E2E_MEMBER.email, E2E_MEMBER.password);
  await guest.goto(questionUrl);
  const guestOverlay = guest.getByRole("dialog", { name: "Frage", exact: true });
  await expect(guestOverlay.getByText("Blau oder grün – was passt zur Marke?")).toBeVisible();
  // Guests may not rename the question, but answer and close it.
  await expect(guestOverlay.getByRole("textbox", { name: "Titel der Frage" })).toHaveCount(0);
  await guestOverlay.getByLabel("Neue Antwort").fill("Ich würde Blau nehmen.");
  await guestOverlay.getByRole("button", { name: "Antworten" }).click();
  await expect(guestOverlay.getByText("Ich würde Blau nehmen.")).toBeVisible();

  await expect(async () => {
    await page.goto("/inbox");
    await expect(page.getByText(/hat in der Frage geantwortet: Welche Farbe für das Logo\?/)).toBeVisible({ timeout: 1000 });
  }).toPass();
  // The notice leads to the question.
  await page.getByRole("link", { name: /hat in der Frage geantwortet/ }).click();
  await expect(page).toHaveURL(/\/questions\?frage=/);
  await expect(page.getByRole("dialog", { name: "Frage", exact: true }).getByText("Ich würde Blau nehmen.")).toBeVisible();

  // Close with a summary that starts from the last answer.
  await page.goto(questionUrl);
  await expect(overlay.getByText("Ich würde Blau nehmen.")).toBeVisible();
  await overlay.getByRole("button", { name: "Als geklärt markieren" }).click();
  const resolve = page.getByRole("dialog", { name: "Frage als geklärt markieren" });
  await expect(resolve.getByLabel("Zusammenfassung")).toHaveValue("Ich würde Blau nehmen.");
  await resolve.getByLabel("Zusammenfassung").fill("Das Logo wird blau.");
  await resolve.getByRole("button", { name: "Als geklärt markieren" }).click();
  await expect(overlay.getByRole("region", { name: "Zusammenfassung" })).toContainText("Das Logo wird blau.");

  // The settled question becomes a task with one click.
  await overlay.getByRole("button", { name: "Aufgabe erstellen" }).click();
  await expect(page.getByText("Aufgabe FRQ-1 angelegt")).toBeVisible();

  // The list: nothing open any more; resolved shows the summary.
  await overlay.getByRole("link", { name: "Schließen" }).click();
  await expect(page.getByText("Keine offenen Fragen")).toBeVisible();
  await page.getByRole("group", { name: "Fragen filtern" }).getByRole("link", { name: /Geklärt/ }).click();
  const row = page.getByRole("list", { name: "Fragen" }).getByRole("listitem").filter({ hasText: "Welche Farbe für das Logo?" });
  await expect(row).toContainText("Das Logo wird blau.");

  // The guest reopens it.
  await guest.reload();
  await guestOverlay.getByRole("button", { name: "Wieder öffnen" }).click();
  await expect(guestOverlay.getByRole("button", { name: "Als geklärt markieren" })).toBeVisible();
  await guestContext.close();

  // Another project cannot be reached through this one: an unknown id shows nothing.
  await page.goto(board.replace(/\/board$/, "/questions?frage=00000000-0000-4000-8000-000000000000"));
  await expect(page.getByRole("dialog", { name: "Frage", exact: true }).getByText("Frage nicht gefunden.")).toBeVisible();
});
