import { expect, test } from "@playwright/test";
import { createDb } from "../../src/server/db/client";
import { createUser } from "../../src/server/users/service";
import { E2E_DATABASE_URL } from "../helpers/test-env";

test("locks the account after five wrong passwords and says so", async ({ page }) => {
  const email = `lock-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const db = createDb(E2E_DATABASE_URL);
  try {
    await createUser(db, { email, name: "Lock Test", password: "RightPassword123!" });
  } finally {
    await db.$client.end();
  }
  const attempt = async (password: string) => {
    await page.goto("/login");
    await page.getByLabel("E-Mail").fill(email);
    await page.getByLabel("Passwort").fill(password);
    await page.getByRole("button", { name: "Anmelden" }).click();
  };
  for (let i = 0; i < 5; i++) {
    await attempt("falsches-passwort");
    await expect(page.getByRole("alert").filter({ hasText: "E-Mail oder Passwort ist falsch." })).toBeVisible();
  }
  await attempt("RightPassword123!");
  await expect(page.getByRole("alert").filter({ hasText: "Zu viele Fehlversuche" })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
