import { expect, test } from "@playwright/test";
import { E2E_MEMBER, closeTask, createProjectViaUi, login } from "./fixtures";

test("comments, mentions, Markdown, files and history are visible in the task panel", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const board = await createProjectViaUi(page, "M6 Unterhaltung", "mse");
  await page.goto(board.replace(/\/board$/, "/settings"));
  await page.getByLabel("E-Mail des Mitglieds").fill(E2E_MEMBER.email);
  await page.getByLabel("Rolle", { exact: true }).selectOption({ label: "Gast" });
  await page.getByRole("button", { name: "Mitglied hinzufügen" }).click();
  await page.goto(board);

  const add = page.getByLabel("Neue Aufgabe in Offen");
  await add.fill("Besprechung");
  await add.press("Enter");
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Besprechung/ }).click();
  const panel = page.getByRole("dialog", { name: "Aufgabe" });
  await panel.getByRole("button", { name: "Bearbeiten" }).first().click();
  await panel.getByLabel("Beschreibung bearbeiten").fill("**Wichtig** <script>alert(1)</script> [Falle](javascript:alert(1)) ![Track](https://evil.test/pixel.png)");
  await panel.getByRole("button", { name: "Speichern" }).click();
  await expect(panel.getByText("Wichtig")).toBeVisible();
  await expect(panel.locator("script, img")).toHaveCount(0);
  await expect(panel.locator('a[href^="javascript:"]')).toHaveCount(0);

  await panel.getByLabel("Neuer Kommentar").fill("Hallo @Mi");
  await panel.getByRole("option", { name: E2E_MEMBER.name }).click();
  await panel.getByRole("button", { name: "Kommentieren" }).click();
  await expect(panel.getByText(E2E_MEMBER.name, { exact: true }).last()).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Kommentare (1)" })).toBeVisible();
  await closeTask(page);
  await expect(page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Besprechung/ })).toContainText("◌ 1");
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Besprechung/ }).click();

  await panel.getByLabel("Datei hochladen").setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
  await expect(panel.getByRole("link", { name: "foto.png" })).toBeVisible();
  await expect(panel.getByRole("img", { name: "foto.png" })).toBeVisible();
  await panel.locator("summary", { hasText: "Verlauf" }).click();
  await expect(panel.getByText(/hat „foto.png“ angehängt/)).toBeVisible();

  await closeTask(page);
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, E2E_MEMBER.email, E2E_MEMBER.password);
  await page.goto(board);
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Besprechung/ }).click();
  const guestPanel = page.getByRole("dialog", { name: "Aufgabe" });
  await expect(guestPanel.getByLabel("Datei hochladen")).toHaveCount(0);
  await expect(guestPanel.getByRole("button", { name: "Bearbeiten" })).toHaveCount(0);
  const guestFile = guestPanel.getByRole("link", { name: "foto.png" });
  const downloadUrl = await guestFile.getAttribute("href");
  expect(downloadUrl).toBeTruthy();
  await expect(guestFile.locator("..").getByRole("button", { name: "Löschen" })).toHaveCount(0);
  await guestPanel.getByLabel("Neuer Kommentar").fill("Mein Kommentar");
  await guestPanel.getByRole("button", { name: "Kommentieren" }).click();
  await expect(guestPanel.getByText("Mein Kommentar")).toBeVisible();
  await expect(guestPanel.getByRole("button", { name: "Bearbeiten" })).toHaveCount(1);
  await guestPanel.getByRole("button", { name: "Bearbeiten" }).click();
  await guestPanel.getByLabel("Kommentar bearbeiten").fill("Mein bearbeiteter Kommentar");
  await guestPanel.getByRole("button", { name: "Speichern" }).click();
  await expect(guestPanel.getByText("Mein bearbeiteter Kommentar")).toBeVisible();

  await closeTask(page);
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page);
  await page.goto(board);
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Besprechung/ }).click();
  const adminFile = page.getByRole("dialog", { name: "Aufgabe" }).getByRole("link", { name: "foto.png" });
  await adminFile.locator("..").getByRole("button", { name: "Löschen" }).click();
  await expect(adminFile).toHaveCount(0);
  expect((await page.request.get(downloadUrl!)).status()).toBe(404);
  const adminPanel = page.getByRole("dialog", { name: "Aufgabe" });
  await adminPanel.getByLabel("Status").selectOption({ label: "In Arbeit" });
  await adminPanel.locator("summary", { hasText: "Verlauf" }).click();
  await expect(adminPanel.getByText(/Status Offen → In Arbeit/)).toBeVisible();
});
