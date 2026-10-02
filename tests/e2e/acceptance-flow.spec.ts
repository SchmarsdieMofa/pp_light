import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createDb } from "../../src/server/db/client";
import { mailOutbox } from "../../src/server/db/schema";
import { openMailBody } from "../../src/server/mail/crypto";
import { sendMail } from "../../src/server/mail/service";
import { E2E_DATABASE_URL } from "../helpers/test-env";
import { closeTask, createProjectViaUi, dragTo, login, choose } from "./fixtures";
import { formatDate } from "../../src/lib/dates";

test.setTimeout(180_000);

async function setDate(page: Page, label: "Start" | "Fällig", value: string) {
  const field = label === "Start" ? "startDate" : "dueDate";
  const saved = page.waitForResponse((response) => response.request().method() === "POST"
    && Boolean(response.request().headers()["next-action"])
    && Boolean(response.request().postData()?.includes(field))
    && Boolean(response.request().postData()?.includes(value)));
  await page.getByRole("dialog", { name: "Aufgabe" }).getByLabel(label).fill(value);
  await page.getByRole("dialog", { name: "Aufgabe" }).getByLabel(label).press("Enter");
  await saved;
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog", { name: "Aufgabe" }).getByLabel(label)).toHaveValue(formatDate(value));
}

test("invitation through Mailpit to project planning and an inbox mention", async ({ page }) => {
  page.setDefaultTimeout(15_000);
  const email = `flow-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = "FlowPassword123!";
  const db = createDb(E2E_DATABASE_URL);
  try {
    await login(page);
    await page.getByRole("complementary").getByRole("link", { name: "Einstellungen" }).click();
    await page.getByRole("dialog", { name: "Einstellungen" }).getByRole("link", { name: "Nutzerverwaltung" }).click();
    await expect(page).toHaveURL(/settings=nutzer/);
    await page.getByRole("textbox", { name: "Name" }).fill("Nina Flow");
    await page.getByRole("textbox", { name: "E-Mail" }).fill(email);
    await page.getByRole("button", { name: "Einladen" }).click();
    await expect(page.getByRole("status")).toContainText("Einladung vorgemerkt");

    // Deliver the encrypted outbox body to the local Mailpit used by the E2E environment.
    const [invite] = await db.select().from(mailOutbox).where(eq(mailOutbox.toEmail, email));
    expect(invite).toBeDefined();
    const previousHost = process.env.SMTP_HOST;
    const previousPort = process.env.SMTP_PORT;
    try {
      process.env.SMTP_HOST = "127.0.0.1";
      process.env.SMTP_PORT = "1025";
      await sendMail(email, invite.subject, openMailBody(invite.body, "e2e-secret-e2e-secret-e2e-secret-e2e"));
    } finally {
      if (previousHost === undefined) delete process.env.SMTP_HOST;
      else process.env.SMTP_HOST = previousHost;
      if (previousPort === undefined) delete process.env.SMTP_PORT;
      else process.env.SMTP_PORT = previousPort;
    }
    const messages = await (await page.request.get("http://localhost:8025/api/v1/messages")).json() as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    const delivered = messages.messages.find((message) => message.To.some((to) => to.Address === email));
    expect(delivered).toBeDefined();
    const mail = await (await page.request.get(`http://localhost:8025/api/v1/message/${delivered!.ID}`)).json() as { Text: string };
    const token = mail.Text.match(/\/invite\/([\w-]+)/)?.[1];
    expect(token).toBeTruthy();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Einstellungen" })).toHaveCount(0);
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto(`/invite/${token}`);
    await page.getByLabel("Neues Passwort").fill(password);
    await page.getByLabel("Passwort wiederholen").fill(password);
    await page.getByRole("button", { name: "Passwort speichern" }).click();
    await expect(page).toHaveURL(/\/login\?password=ready/);
    await login(page, email, password);
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page);
    await page.waitForLoadState("networkidle");

    const board = await createProjectViaUi(page, "Abnahme-Fluss", "abf");
    await page.goto(board.replace(/\/board$/, "/settings"));
    await page.getByLabel("E-Mail des Mitglieds").fill(email);
    await page.getByRole("button", { name: "Mitglied hinzufügen" }).click();
    await expect(page.getByRole("list", { name: "Mitglieder" })).toContainText("Nina Flow");
    await page.goto(board);

    for (const title of ["Ausgang", "Nachfolger"]) {
      const input = page.getByLabel("Neue Aufgabe in Offen");
      await input.fill(title);
      await input.press("Enter");
      await expect(page.getByRole("region", { name: "Offen" }).getByRole("link", { name: new RegExp(title) })).toBeVisible();
    }
    await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Ausgang/ }).click();
    const panel = page.getByRole("dialog", { name: "Aufgabe" });
    await panel.getByLabel("Neue Unteraufgabe").fill("Prüfung");
    await panel.getByLabel("Neue Unteraufgabe").press("Enter");
    await expect(panel.getByRole("region", { name: "Unteraufgaben" })).toContainText("Prüfung");
    await panel.getByRole("link", { name: "Schließen" }).click();

    const moved = page.waitForResponse((response) => response.request().method() === "POST"
      && Boolean(response.request().headers()["next-action"]));
    await dragTo(page, page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Ausgang/ }), page.getByRole("region", { name: "In Arbeit" }));
    await moved;
    await page.reload();
    await expect(page.getByRole("region", { name: "In Arbeit" })).toContainText("Ausgang");

    await page.getByRole("region", { name: "In Arbeit" }).getByRole("link", { name: /Ausgang/ }).click();
    await setDate(page, "Start", "2026-10-01");
    await setDate(page, "Fällig", "2026-10-02");
    await panel.getByRole("link", { name: "Schließen" }).click();
    await expect(panel).toBeHidden();
    await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Nachfolger/ }).click();
    await expect(panel.getByLabel("Titel")).toHaveValue("Nachfolger");
    await setDate(page, "Start", "2026-10-05");
    await setDate(page, "Fällig", "2026-10-06");
    await choose(panel.getByRole("combobox", { name: "Blocker hinzufügen" }), "ABF-1 Ausgang");
    await panel.getByRole("button", { name: "Hinzufügen" }).first().click();
    await expect(panel.getByRole("link", { name: /ABF-1 Ausgang/ })).toBeVisible();

    await page.goto(board.replace(/\/board$/, "/gantt"));
    await page.getByRole("button", { name: "Tag" }).click();
    const bar = page.locator(".wx-bar.wx-task").filter({ hasText: "ABF-1 Ausgang" });
    const box = await bar.boundingBox();
    if (!box) throw new Error("Gantt-Balken nicht sichtbar");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 176, box.y + box.height / 2, { steps: 20 });
    await page.mouse.up();
    await expect(page.getByRole("row", { name: /ABF-2 Nachfolger/ })).toContainText("08.10.2026", { timeout: 15_000 });

    await page.goto(board);
    await page.getByRole("region", { name: "In Arbeit" }).getByRole("link", { name: /Ausgang/ }).click();
    await panel.getByLabel("Neuer Kommentar").fill("Bitte @Ni");
    await panel.getByRole("option", { name: "Nina Flow" }).click();
    await panel.getByLabel("Neuer Kommentar").pressSequentially(" prüfen");
    await panel.getByRole("button", { name: "Kommentieren" }).click();
    await expect(panel.getByRole("heading", { name: "Kommentare (1)" })).toBeVisible();

    await closeTask(page);
    await page.getByRole("button", { name: "Abmelden" }).click();
    await login(page, email, password);
    await page.getByRole("link", { name: /Benachrichtigungen/ }).click();
    await expect(page.getByRole("list", { name: "Benachrichtigungen" })).toContainText("Ausgang");
  } finally {
    await db.$client.end();
  }
});
