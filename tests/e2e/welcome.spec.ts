import { expect, test } from "@playwright/test";
import { createDb } from "../../src/server/db/client";
import { createUser } from "../../src/server/users/service";
import { E2E_DATABASE_URL } from "../helpers/test-env";

test("a new user gets the welcome tour once and can open it again", async ({ page }) => {
  const email = `neu-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const db = createDb(E2E_DATABASE_URL);
  try {
    await createUser(db, { email, name: "Nele Neu", password: "NelesPasswort123!" });
  } finally {
    await db.$client.end();
  }

  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill("NelesPasswort123!");
  await page.getByRole("button", { name: "Anmelden" }).click();

  const tour = page.getByRole("dialog");
  await expect(tour.getByRole("heading", { name: "Willkommen, Nele!" })).toBeVisible();
  await expect(tour.getByRole("img", { name: "Schritt 1 von 6" })).toBeVisible();
  await tour.getByRole("button", { name: "Weiter" }).click();
  await expect(tour.getByRole("heading", { name: "Meine Arbeit" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(tour.getByRole("heading", { name: "Projekte: Board, Gantt, Liste" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(tour.getByRole("heading", { name: "Meine Arbeit" })).toBeVisible();
  for (let i = 0; i < 4; i++) await tour.getByRole("button", { name: "Weiter" }).click();
  // Members get no admin step; without a project the tour ends with the way to create one.
  await expect(tour.getByRole("heading", { name: "Benachrichtigungen" })).toBeVisible();
  await expect(tour.getByRole("button", { name: "Überspringen" })).toHaveCount(0);
  await tour.getByRole("button", { name: "Erstes Projekt anlegen" }).click();
  await expect(page.getByRole("dialog", { name: "Neues Projekt" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Meine Arbeit", level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Again from the shortcut help; closing drops ?welcome=1 from the address.
  await page.keyboard.press("?");
  await page.getByRole("dialog", { name: "Tastenkürzel" }).getByRole("button", { name: "Einführung ansehen" }).click();
  await expect(page).toHaveURL(/\?welcome=1$/);
  await expect(tour.getByRole("heading", { name: "Willkommen, Nele!" })).toBeVisible();
  await tour.getByRole("button", { name: "Schließen" }).click();
  await expect(page).not.toHaveURL(/welcome/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
