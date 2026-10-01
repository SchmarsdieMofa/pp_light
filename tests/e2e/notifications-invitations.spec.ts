import { expect, test } from "@playwright/test";
import { desc, eq } from "drizzle-orm";
import { createDb } from "../../src/server/db/client";
import { mailOutbox, notifications, users } from "../../src/server/db/schema";
import { openMailBody } from "../../src/server/mail/crypto";
import { E2E_DATABASE_URL } from "../helpers/test-env";
import { E2E_ADMIN, login } from "./fixtures";

test("admin invites a user who sets a password, then resets it", async ({ page }) => {
  const email = `nina-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const db = createDb(E2E_DATABASE_URL);
  try {
    await login(page);
    await page.getByRole("link", { name: "Nutzerverwaltung" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill("Nina Example");
    await page.getByRole("textbox", { name: "E-Mail" }).fill(email);
    await page.getByRole("button", { name: "Einladen" }).click();
    await expect(page.getByRole("status")).toContainText("Einladung vorgemerkt");
    const [invite] = await db.select().from(mailOutbox).where(eq(mailOutbox.toEmail, email));
    const token = openMailBody(invite.body, "e2e-secret-e2e-secret-e2e-secret-e2e").match(/\/invite\/([\w-]+)/)![1];
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto(`/invite/${token}`);
    await page.getByLabel("Neues Passwort").fill("NinaPassword123!");
    await page.getByLabel("Passwort wiederholen").fill("NinaPassword123!");
    await page.getByRole("button", { name: "Passwort speichern" }).click();
    await expect(page).toHaveURL(/\/login\?password=ready/);
    await login(page, email, "NinaPassword123!");
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/reset");
    await page.getByRole("textbox", { name: "E-Mail" }).fill(email);
    await page.getByRole("button", { name: "Link anfordern" }).click();
    await expect(page.getByRole("status")).toContainText("Falls ein Konto besteht");
    const [reset] = await db.select().from(mailOutbox).where(eq(mailOutbox.toEmail, email))
      .orderBy(desc(mailOutbox.createdAt)).limit(1);
    const resetToken = openMailBody(reset.body, "e2e-secret-e2e-secret-e2e-secret-e2e").match(/\/reset\/([\w-]+)/)![1];
    await page.goto(`/reset/${resetToken}`);
    await page.getByLabel("Neues Passwort").fill("NewPassword123!");
    await page.getByLabel("Passwort wiederholen").fill("NewPassword123!");
    await page.getByRole("button", { name: "Passwort speichern" }).click();
    await login(page, email, "NewPassword123!");
  } finally { await db.$client.end(); }
});

test("inbox shows a new notice and marks it read", async ({ page }) => {
  const db = createDb(E2E_DATABASE_URL);
  try {
    await login(page);
    const [admin] = await db.select().from(users).where(eq(users.email, E2E_ADMIN.email));
    await db.insert(notifications).values({ userId: admin.id, type: "mentioned", message: "Ada wurde erwähnt", eventKey: `e2e-${crypto.randomUUID()}` });
    await page.reload();
    await expect(page.getByLabel("1 ungelesen")).toBeVisible();
    await page.getByRole("link", { name: /Benachrichtigungen/ }).click();
    await expect(page.getByRole("list", { name: "Benachrichtigungen" })).toContainText("Ada wurde erwähnt");
    await page.getByRole("button", { name: "Alle als gelesen markieren" }).click();
    await expect(page.getByLabel("1 ungelesen")).toHaveCount(0);
  } finally { await db.$client.end(); }
});
