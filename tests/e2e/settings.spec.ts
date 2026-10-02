import { expect, test } from "@playwright/test";
import { createDb } from "../../src/server/db/client";
import { createUser } from "../../src/server/users/service";
import { E2E_DATABASE_URL } from "../helpers/test-env";
import { E2E_MEMBER, login } from "./fixtures";

test("changes own name and password from the settings", async ({ page }) => {
  const email = `konto-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const db = createDb(E2E_DATABASE_URL);
  try {
    await createUser(db, { email, name: "Kai Konto", password: "AltesPasswort123!" });
  } finally {
    await db.$client.end();
  }

  await login(page, email, "AltesPasswort123!");
  await page.getByRole("complementary").getByRole("link", { name: "Einstellungen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog).toBeVisible();
  // Members get no user management.
  await expect(dialog.getByRole("link", { name: "Nutzerverwaltung" })).toHaveCount(0);

  const name = dialog.getByLabel("Name", { exact: true });
  await name.fill("Kai Neu");
  await name.press("Enter");
  await expect(page.locator("aside").getByText("Kai Neu")).toBeVisible();

  const form = dialog.getByRole("form", { name: "Passwort ändern" });
  await form.getByLabel("Aktuelles Passwort").fill("falsch-falsch-1");
  await form.getByLabel("Neues Passwort", { exact: true }).fill("NeuesPasswort123!");
  await form.getByLabel("Neues Passwort wiederholen").fill("NeuesPasswort123!");
  await form.getByRole("button", { name: "Passwort ändern" }).click();
  await expect(page.getByText("Das aktuelle Passwort stimmt nicht.")).toBeVisible();

  await form.getByLabel("Aktuelles Passwort").fill("AltesPasswort123!");
  await form.getByRole("button", { name: "Passwort ändern" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, email, "NeuesPasswort123!");
  await expect(page.getByRole("complementary").getByText("Kai Neu")).toBeVisible();
});

test("admins manage users in the settings overlay; members only see their account", async ({ page, browser }) => {
  await login(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/\?settings=nutzer$/);
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog.getByRole("link", { name: "Nutzerverwaltung" })).toHaveAttribute("aria-current", "page");
  await expect(dialog.getByRole("combobox", { name: `Rolle von ${E2E_MEMBER.name}` })).toHaveText("Mitglied");

  // The overlay sits above the current view and closes with Esc, keeping the page.
  await page.goto("/calendar?settings=konto");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/calendar$/);

  const context = await browser.newContext();
  const member = await context.newPage();
  await login(member, E2E_MEMBER.email, E2E_MEMBER.password);
  await member.goto("/settings/users");
  const memberDialog = member.getByRole("dialog", { name: "Einstellungen" });
  await expect(memberDialog.getByRole("form", { name: "Passwort ändern" })).toBeVisible();
  await expect(memberDialog.getByRole("combobox", { name: /Rolle von/ })).toHaveCount(0);
  await context.close();
});
