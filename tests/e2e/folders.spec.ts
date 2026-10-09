import { expect, test, type Locator } from "@playwright/test";
import { choose, createProjectViaUi, E2E_MEMBER, login } from "./fixtures";

test("people in a folder get every project in it; leaving the folder takes it away", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const suffix = crypto.randomUUID().slice(0, 4);
  const folderName = `Kunde ${suffix}`;
  const projectName = `Ordner-Projekt ${suffix}`;
  await login(page);

  // Anyone can create a folder; its dialog opens to add people.
  const sidebar = page.getByRole("navigation", { name: "Hauptnavigation" });
  await sidebar.getByRole("button", { name: "Neuer Ordner" }).click();
  await page.getByLabel("Name", { exact: true }).fill(folderName);
  await page.getByRole("button", { name: "Anlegen" }).click();
  const dialog = page.getByRole("dialog", { name: `Ordner ${folderName}` });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Name oder E-Mail des Mitglieds" }).fill(E2E_MEMBER.email);
  await choose(dialog.getByRole("combobox", { name: "Rolle im Ordner" }), "Mitglied");
  await dialog.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(dialog.getByRole("list", { name: "Mitglieder des Ordners" })).toContainText(E2E_MEMBER.name);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // A project created in the folder lands in the folder's sidebar section.
  await sidebar.getByRole("button", { name: "Neues Projekt" }).click();
  const create = page.getByRole("dialog", { name: "Neues Projekt" });
  await create.getByLabel("Name", { exact: true }).fill(projectName);
  await create.getByLabel("Kürzel").fill(`F${suffix}`.toUpperCase());
  await choose(create.getByRole("combobox", { name: "Ordner" }), folderName);
  await create.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
  const section = sidebar.getByRole("group", { name: `Ordner ${folderName}` });
  await expect(section.getByRole("link", { name: new RegExp(projectName) })).toBeVisible();

  // The project's member list says where Mia's access comes from.
  await page.getByRole("link", { name: "Einstellungen" }).last().click();
  await expect(page.getByRole("list", { name: "Mitglieder" })).toContainText("über den Ordner");

  // Mia sees folder and project without ever being added to the project.
  const miaContext = await browser.newContext();
  const mia = await miaContext.newPage();
  await login(mia, E2E_MEMBER.email, E2E_MEMBER.password);
  const miaSection = mia.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("group", { name: `Ordner ${folderName}` });
  await expect(miaSection.getByRole("link", { name: new RegExp(projectName) })).toBeVisible();
  // Moving is for the project's owners (in a folder: its owners); Mia is neither, the row is not draggable for her.
  await expect(miaSection.getByRole("link", { name: new RegExp(projectName) }).locator("xpath=ancestor::li[1]")).toHaveAttribute("draggable", "false");
  await expect(section.getByRole("link", { name: new RegExp(projectName) }).locator("xpath=ancestor::li[1]")).toHaveAttribute("draggable", "true");
  // As a folder member (not owner) she cannot manage it.
  await miaSection.getByRole("button", { name: `Ordner ${folderName} verwalten` }).click({ force: true });
  const miaDialog = mia.getByRole("dialog", { name: `Ordner ${folderName}` });
  await expect(miaDialog.getByRole("list", { name: "Mitglieder des Ordners" })).toContainText(E2E_MEMBER.name);
  await expect(miaDialog.getByRole("button", { name: "Ordner löschen" })).toHaveCount(0);
  await expect(miaDialog.getByRole("form", { name: "Zum Ordner hinzufügen" })).toHaveCount(0);

  // The owner takes her out: the project disappears for her.
  await page.goto("/projects");
  await page.getByRole("region", { name: "Projektliste" }).getByRole("button", { name: `Ordner ${folderName} verwalten` }).click();
  const owner = page.getByRole("dialog", { name: `Ordner ${folderName}` });
  await owner.getByRole("button", { name: `${E2E_MEMBER.name} aus dem Ordner entfernen` }).click();
  await page.getByRole("dialog", { name: `${E2E_MEMBER.name} aus dem Ordner entfernen?` }).getByRole("button", { name: "Entfernen" }).click();
  await expect(owner.getByRole("list", { name: "Mitglieder des Ordners" })).not.toContainText(E2E_MEMBER.name);
  await mia.reload();
  await expect(mia.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: new RegExp(projectName) })).toHaveCount(0);
  await miaContext.close();
});

test("a project moves into a folder and out again from its settings", async ({ page }) => {
  const suffix = crypto.randomUUID().slice(0, 4);
  const folderName = `Ablage ${suffix}`;
  await login(page);
  const sidebar = page.getByRole("navigation", { name: "Hauptnavigation" });
  await sidebar.getByRole("button", { name: "Neuer Ordner" }).click();
  await page.getByLabel("Name", { exact: true }).fill(folderName);
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByRole("dialog", { name: `Ordner ${folderName}` })).toBeVisible();
  await page.keyboard.press("Escape");

  const board = await createProjectViaUi(page, `Wandernd ${suffix}`, `W${suffix}`.toUpperCase());
  await page.goto(board.replace(/\/board$/, "/settings"));
  await choose(page.getByRole("combobox", { name: "Ordner" }), folderName);
  const section = sidebar.getByRole("group", { name: `Ordner ${folderName}` });
  await expect(section.getByRole("link", { name: new RegExp(`Wandernd ${suffix}`) })).toBeVisible();
  await choose(page.getByRole("combobox", { name: "Ordner" }), "Kein Ordner");
  await expect(section.getByRole("link", { name: new RegExp(`Wandernd ${suffix}`) })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: new RegExp(`Wandernd ${suffix}`) })).toBeVisible();

  // Deleting the folder keeps the project.
  await page.goto("/projects");
  await page.getByRole("region", { name: "Projektliste" }).getByRole("button", { name: `Ordner ${folderName} verwalten` }).click();
  const dialog = page.getByRole("dialog", { name: `Ordner ${folderName}` });
  await dialog.getByRole("button", { name: "Ordner löschen" }).click();
  await page.getByRole("dialog", { name: `Ordner „${folderName}“ löschen?` }).getByRole("button", { name: "Löschen" }).click();
  await expect(page.getByRole("button", { name: `Ordner ${folderName} verwalten` })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Projektliste" }).getByRole("link", { name: `Wandernd ${suffix}`, exact: true })).toBeVisible();
});

test("a project is dragged into a folder and out of it again", async ({ page }) => {
  const suffix = crypto.randomUUID().slice(0, 4);
  const folderName = `Zieh ${suffix}`;
  const projectName = `Zieh-Projekt ${suffix}`;
  await login(page);
  const sidebar = page.getByRole("navigation", { name: "Hauptnavigation" });

  await sidebar.getByRole("button", { name: "Neuer Ordner" }).click();
  await page.getByLabel("Name", { exact: true }).fill(folderName);
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByRole("dialog", { name: `Ordner ${folderName}` })).toBeVisible();
  await page.keyboard.press("Escape");
  await createProjectViaUi(page, projectName, `Z${suffix}`.toUpperCase());

  const section = sidebar.getByRole("group", { name: `Ordner ${folderName}` });
  const project = new RegExp(projectName);
  const drag = async (from: Locator, to: () => Locator) => {
    const source = (await from.boundingBox())!;
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(source.x + source.width / 2 + 10, source.y + source.height / 2 + 10, { steps: 3 });
    // The drop targets are measured once the drag is on (a hint appears in the unfoldered list).
    await expect(to()).toBeVisible();
    const target = (await to().boundingBox())!;
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await page.mouse.up();
  };

  await drag(sidebar.getByRole("link", { name: project }), () => section);
  await expect(page.getByText(`${projectName} liegt jetzt im Ordner ${folderName}`)).toBeVisible();
  await expect(section.getByRole("link", { name: project })).toBeVisible();

  await drag(section.getByRole("link", { name: project }), () => sidebar.locator("#sidebar-projects"));
  await expect(page.getByText(`${projectName} liegt in keinem Ordner mehr`)).toBeVisible();
  await expect(section.getByRole("link", { name: project })).toHaveCount(0);
  await expect(sidebar.locator("#sidebar-projects").getByRole("link", { name: project })).toBeVisible();
});
