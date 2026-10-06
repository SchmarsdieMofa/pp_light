import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createDb } from "../../src/server/db/client";
import { users } from "../../src/server/db/schema";
import { markOnboarded } from "../../src/server/preferences/service";
import { createProject } from "../../src/server/projects/service";
import { createUser } from "../../src/server/users/service";
import { E2E_DATABASE_URL } from "../helpers/test-env";
import { choose, E2E_ADMIN, login } from "./fixtures";

const suffix = crypto.randomUUID().slice(0, 8);
const manager = { email: `manager-${suffix}@example.com`, password: "manager-passwort-1", name: `Mona Manager ${suffix}` };
const colleague = { email: `kollege-${suffix}@example.com`, password: "kollege-passwort-1", name: `Kai Kollege ${suffix}` };
const adminProjectName = `Nur Admin ${suffix}`;
let adminProjectId: string;

test.beforeAll(async () => {
  const db = createDb(E2E_DATABASE_URL);
  try {
    const [admin] = await db.select().from(users).where(eq(users.email, E2E_ADMIN.email));
    for (const [person, role] of [[manager, "manager"], [colleague, "member"]] as const) {
      const user = await createUser(db, { ...person, role });
      await markOnboarded(db, user.id);
    }
    adminProjectId = (await createProject(db, admin, { name: adminProjectName, key: `AD${suffix.slice(0, 5)}` })).id;
  } finally {
    await db.$client.end();
  }
});

test("a manager runs people and groups, but not backups, servers or roles", async ({ page }) => {
  await login(page, manager.email, manager.password);
  await page.goto("/?settings=nutzer");
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  const tabs = dialog.getByRole("navigation", { name: "Einstellungsbereiche" });
  await expect(tabs.getByRole("link", { name: "Nutzerverwaltung" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Gruppen" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Backups" })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "Server" })).toHaveCount(0);

  // No role to hand out in the invitation form; everyone invited is a plain member.
  await expect(dialog.getByRole("combobox", { name: "Rolle", exact: true })).toHaveCount(0);
  const invitee = `neu-${suffix}@example.com`;
  await dialog.getByRole("textbox", { name: "Name" }).fill("Nele Neu");
  await dialog.getByRole("textbox", { name: "E-Mail" }).fill(invitee);
  await dialog.getByRole("button", { name: "Einladen" }).click();
  await expect(dialog.getByRole("status")).toContainText("Einladung vorgemerkt");
  const invited = dialog.getByRole("list", { name: "Nutzer", exact: true }).locator("li").filter({ hasText: invitee });
  await expect(invited).toContainText("Eingeladen");
  await expect(invited.getByRole("button", { name: "Einladung zurückziehen" })).toBeVisible();

  // Members can be deactivated – but nobody's role is editable, and admins and managers are untouchable.
  const list = dialog.getByRole("list", { name: "Nutzer", exact: true });
  await expect(dialog.getByRole("combobox", { name: /Rolle von/ })).toHaveCount(0);
  const adminRow = list.locator("li").filter({ hasText: E2E_ADMIN.email });
  await expect(adminRow).toContainText("Admin");
  await expect(adminRow.locator("button, [role=combobox]")).toHaveCount(0);
  const ownRow = list.locator("li").filter({ hasText: manager.email });
  await expect(ownRow).toContainText("Manager");
  await expect(ownRow.locator("button, [role=combobox]")).toHaveCount(0);
  const colleagueRow = list.locator("li").filter({ hasText: colleague.email });
  await expect(colleagueRow.getByRole("button", { name: "Deaktivieren" })).toBeVisible();

  // Typing the admin-only tabs into the URL does not open them.
  for (const tab of ["backups", "server"]) {
    await page.goto(`/?settings=${tab}`);
    await expect(dialog.getByRole("form", { name: "Passwort ändern" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Jetzt sichern" })).toHaveCount(0);
    await expect(dialog.getByText("Nur HTTPS")).toHaveCount(0);
  }

  // Groups.
  await page.goto("/?settings=gruppen");
  await dialog.getByLabel("Name der neuen Gruppe").fill(`Team ${suffix}`);
  await dialog.getByRole("button", { name: "Gruppe anlegen" }).click();
  const group = dialog.getByRole("region", { name: `Gruppe Team ${suffix}` });
  await expect(group).toBeVisible();
  await group.getByRole("combobox", { name: `Person zu Team ${suffix} hinzufügen` }).click();
  await page.getByRole("option", { name: new RegExp(colleague.email) }).click();
  await expect(group.getByRole("list", { name: `Mitglieder von Team ${suffix}` })).toContainText(colleague.name);
});

test("a manager does not see projects they are not a member of", async ({ page }) => {
  await login(page, manager.email, manager.password);
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projekte" }).first()).toBeVisible();
  await expect(page.getByText(adminProjectName)).toHaveCount(0);
  const response = await page.goto(`/projects/${adminProjectId}/board`);
  expect(response?.status()).toBe(404);
});

test("plain members get no people or system administration", async ({ browser }) => {
  const page = await browser.newPage();
  await login(page, colleague.email, colleague.password);
  for (const tab of ["nutzer", "gruppen", "backups", "server"]) {
    await page.goto(`/?settings=${tab}`);
    const dialog = page.getByRole("dialog", { name: "Einstellungen" });
    await expect(dialog.getByRole("form", { name: "Passwort ändern" })).toBeVisible();
    await expect(dialog.getByRole("navigation", { name: "Einstellungsbereiche" })).toHaveCount(0);
  }
  await page.close();
});

test("an admin makes someone manager, who then sees the people tabs after the next page load", async ({ page, browser }) => {
  await login(page);
  await page.goto("/?settings=nutzer");
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await choose(dialog.getByRole("combobox", { name: `Rolle von ${colleague.name}` }), "Manager");
  const row = dialog.getByRole("list", { name: "Nutzer", exact: true }).locator("li").filter({ hasText: colleague.email });
  await expect(row).toContainText("Manager");

  const context = await browser.newContext();
  const promoted = await context.newPage();
  await login(promoted, colleague.email, colleague.password);
  await promoted.goto("/?settings=nutzer");
  await expect(promoted.getByRole("dialog", { name: "Einstellungen" }).getByRole("link", { name: "Gruppen" })).toBeVisible();

  // And back: the demotion is effective immediately, without logging in again.
  await choose(dialog.getByRole("combobox", { name: `Rolle von ${colleague.name}` }), "Mitglied");
  await expect(row).not.toContainText("Manager");
  await promoted.goto("/?settings=nutzer");
  await expect(promoted.getByRole("dialog", { name: "Einstellungen" }).getByRole("form", { name: "Passwort ändern" })).toBeVisible();
  await expect(promoted.getByRole("link", { name: "Gruppen" })).toHaveCount(0);
  await context.close();
});
