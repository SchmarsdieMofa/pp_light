import { expect, test, type Page, type Response } from "@playwright/test";
import { createProjectViaUi, dragTo, E2E_MEMBER, login, choose } from "./fixtures";

async function addInColumn(page: Page, column: string, title: string) {
  const input = page.getByLabel(`Neue Aufgabe in ${column}`);
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByRole("region", { name: column }).getByRole("link", { name: new RegExp(title) })).toBeVisible();
}

/** Resolves once `count` server-action responses arrived (Next runs server actions one after another). */
function serverActions(page: Page, count: number): Promise<void> {
  let seen = 0;
  return new Promise((resolve) => {
    const onResponse = (response: Response) => {
      if (response.request().method() === "POST" && response.request().headers()["next-action"] && ++seen >= count) {
        page.off("response", onResponse);
        resolve();
      }
    };
    page.on("response", onResponse);
  });
}

const card = (page: Page, column: string, title: string) =>
  page.getByRole("region", { name: column }).getByRole("link", { name: new RegExp(title) });

test("drags cards between and within columns and keeps the order after reload", async ({ page }) => {
  await login(page);
  await createProjectViaUi(page, "Kanban-Test", "kan");
  await addInColumn(page, "Offen", "Karte A");
  await addInColumn(page, "Offen", "Karte B");
  await addInColumn(page, "Offen", "Karte C");
  // New cards enter at the top of the column, so adding never needs scrolling.
  await expect(page.getByRole("region", { name: "Offen" }).getByRole("link")).toHaveText([/Karte C/, /Karte B/, /Karte A/]);

  // Both moves are shown optimistically; wait for both server actions before reloading.
  const bothSaved = serverActions(page, 2);
  await dragTo(page, card(page, "Offen", "Karte A"), page.getByRole("region", { name: "In Arbeit" }));
  await expect(card(page, "In Arbeit", "Karte A")).toBeVisible();

  await dragTo(page, card(page, "Offen", "Karte C"), card(page, "Offen", "Karte B"));
  await expect(page.getByRole("region", { name: "Offen" }).getByRole("link")).toHaveText([/Karte B/, /Karte C/]);
  await bothSaved;
  await page.reload();
  await expect(card(page, "In Arbeit", "Karte A")).toBeVisible();
  await expect(page.getByRole("region", { name: "Offen" }).getByRole("link")).toHaveText([/Karte B/, /Karte C/]);

  await card(page, "In Arbeit", "Karte A").click();
  await expect(page.getByRole("dialog", { name: "Aufgabe" }).getByLabel("Status")).toHaveText(/.+/);
  await expect(page.getByRole("dialog", { name: "Aufgabe" }).getByLabel("Titel")).toHaveValue("Karte A");
});

test("opens a card as overlay and closes it with Esc or a click beside it", async ({ page }) => {
  await login(page);
  await createProjectViaUi(page, "Overlay-Test", "ovl");
  await addInColumn(page, "Offen", "Overlay-Karte");

  await card(page, "Offen", "Overlay-Karte").click();
  const overlay = page.getByRole("dialog", { name: "Aufgabe OVL-1" });
  const title = overlay.getByRole("textbox", { name: "Titel" });
  await expect(title).toHaveValue("Overlay-Karte");

  // Esc in a field leaves the field and saves it; the next Esc closes the overlay.
  const saved = serverActions(page, 1);
  await title.fill("Overlay-Karte neu");
  await title.press("Escape");
  await saved;
  await expect(overlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
  await expect(page).not.toHaveURL(/task=/);
  await expect(card(page, "Offen", "Overlay-Karte neu")).toBeVisible();

  await card(page, "Offen", "Overlay-Karte neu").click();
  await expect(overlay).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(overlay).toHaveCount(0);
});

test("switches card density and remembers it", async ({ page }) => {
  await login(page);
  await createProjectViaUi(page, "Dichte-Test", "den");
  await addInColumn(page, "Offen", "Dichte-Karte");
  await expect(card(page, "Offen", "Dichte-Karte")).toContainText("DEN-1");

  const group = page.getByRole("group", { name: "Kartendichte" });
  await group.getByRole("button", { name: "Kompakt" }).click();
  await expect(card(page, "Offen", "Dichte-Karte")).not.toContainText("DEN-1");
  await page.reload();
  await expect(page.getByRole("group", { name: "Kartendichte" }).getByRole("button", { name: "Kompakt" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(card(page, "Offen", "Dichte-Karte")).not.toContainText("DEN-1");
  await page.getByRole("group", { name: "Kartendichte" }).getByRole("button", { name: "Mittel" }).click();
  await expect(card(page, "Offen", "Dichte-Karte")).toContainText("DEN-1");
});

test("manages status columns", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Spalten-Test", "spa");
  await addInColumn(page, "Review", "Wird verschoben");
  await page.goto(board.replace(/\/board$/, "/settings"));

  await page.getByLabel("Name der neuen Spalte").fill("Blockiert");
  await page.getByRole("button", { name: "Spalte hinzufügen" }).click();
  const row = page.getByRole("group", { name: "Spalte Blockiert" });
  await expect(row).toBeVisible();
  // Renaming saves on Enter – no save button.
  await row.getByLabel("Name").fill("Wartet");
  await row.getByLabel("Name").press("Enter");
  await expect(page.getByRole("group", { name: "Spalte Wartet" })).toBeVisible();
  await page.getByRole("button", { name: "Wartet nach links" }).click();

  await page.getByRole("button", { name: "Spalte Review löschen" }).click();
  const confirm = page.getByRole("dialog", { name: "Spalte „Review“ löschen?" });
  await choose(confirm.getByLabel("Aufgaben verschieben nach"), "Offen");
  await confirm.getByRole("button", { name: "Spalte löschen" }).click();
  await expect(page.getByRole("group", { name: "Spalte Review" })).toHaveCount(0);

  await page.goto(board);
  await expect(page.getByRole("region")).toHaveCount(5);
  const names = await page.locator("section[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(names.filter((n) => n !== "Notifications alt+T")).toEqual(["Offen", "In Arbeit", "Wartet", "Fertig"]);
  await expect(card(page, "Offen", "Wird verschoben")).toBeVisible();
});

test("adds members, assigns them and protects the last owner", async ({ page }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Team-Test", "tea");
  const settings = board.replace(/\/board$/, "/settings");
  await page.goto(settings);

  await page.getByLabel("E-Mail des Mitglieds").fill("niemand@example.com");
  await page.getByRole("button", { name: "Mitglied hinzufügen" }).click();
  await expect(page.getByText("Kein aktiver Nutzer mit dieser E-Mail-Adresse.")).toBeVisible();

  await page.getByLabel("E-Mail des Mitglieds").fill(E2E_MEMBER.email);
  await page.getByRole("button", { name: "Mitglied hinzufügen" }).click();
  await expect(page.getByRole("list", { name: "Mitglieder" })).toContainText(E2E_MEMBER.name);

  await choose(page.getByLabel("Rolle von Ada Admin"), "Mitglied");
  await expect(page.getByText("Ein Projekt braucht mindestens einen Owner.")).toBeVisible();

  await page.goto(board);
  await addInColumn(page, "Offen", "Team-Aufgabe");
  await card(page, "Offen", "Team-Aufgabe").click();
  const panel = page.getByRole("dialog", { name: "Aufgabe" });
  await panel.getByLabel("Zuständige").first().click();
  await panel.getByRole("group", { name: "Zuständige" }).getByRole("checkbox", { name: E2E_MEMBER.name }).check();
  await panel.getByRole("link", { name: "Schließen" }).click();
  await expect(card(page, "Offen", "Team-Aufgabe")).toContainText("MM");
});
