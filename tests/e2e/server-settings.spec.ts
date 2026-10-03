import { expect, test } from "@playwright/test";
import { E2E_MEMBER, login } from "./fixtures";

test("admin sets the mail address; HTTPS-only stays locked over plain HTTP", async ({ page }) => {
  await login(page);
  await page.goto("/?settings=server");
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog.getByRole("link", { name: "Server" })).toHaveAttribute("aria-current", "page");

  const address = dialog.getByLabel("Adresse");
  const before = await address.inputValue();
  await address.fill("kein-link");
  await address.press("Enter");
  await expect(page.getByText("Bitte eine Adresse wie https://pp.firma.local angeben.")).toBeVisible();
  await expect(address).toHaveValue(before);

  await address.fill("https://pp.firma.local/");
  await address.press("Enter");
  await page.reload();
  await expect(dialog.getByLabel("Adresse")).toHaveValue("https://pp.firma.local");
  // Put it back: invitation tests read links from mails.
  await dialog.getByLabel("Adresse").fill(before);
  await dialog.getByLabel("Adresse").press("Enter");
  await page.reload();
  await expect(dialog.getByLabel("Adresse")).toHaveValue(before);

  // The test server is plain HTTP: switching to HTTPS-only would lock everyone out.
  await expect(dialog.getByRole("radio", { name: /HTTP und HTTPS/ })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: /Nur HTTPS/ })).toBeDisabled();
  await expect(dialog.getByRole("link", { name: "Über HTTPS öffnen" })).toHaveAttribute("href", "https://localhost/?settings=server");
});

test("members get no server tab and the setup page sends them to login", async ({ page }) => {
  await login(page, E2E_MEMBER.email, E2E_MEMBER.password);
  await page.goto("/?settings=server");
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog.getByRole("link", { name: "Server" })).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "Profil" })).toBeVisible();

  await page.goto("/setup");
  await expect(page).toHaveURL(/\/$|\/login$/);
});
