import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { createDb } from "../../src/server/db/client";
import { users } from "../../src/server/db/schema";
import { saveAppointment } from "../../src/server/appointments/service";
import { createLabel } from "../../src/server/labels/service";
import { addMemberByEmail } from "../../src/server/members/service";
import { createMyTask } from "../../src/server/my-work/service";
import { createProject } from "../../src/server/projects/service";
import { setTaskAssignees, setTaskLabels } from "../../src/server/tasks/relations";
import { getTaskDetail } from "../../src/server/tasks/queries";
import { updateTask } from "../../src/server/tasks/service";
import { E2E_DATABASE_URL } from "../helpers/test-env";
import { choose, E2E_ADMIN, E2E_MEMBER, login } from "./fixtures";

test("filters my work, saves my order and plans private blocks in an hourly day calendar", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const db = createDb(E2E_DATABASE_URL);
  const [ada] = await db.select().from(users).where(eq(users.email, E2E_ADMIN.email));
  const [mia] = await db.select().from(users).where(eq(users.email, E2E_MEMBER.email));
  let projectId: string;
  try {
    const project = await createProject(db, ada, { name: "Persönlicher Tagesplan", key: "PDP" });
    projectId = project.id;
    await addMemberByEmail(db, ada, project.id, mia.email, "member");
    const label = await createLabel(db, ada, { projectId: project.id, name: "Fokus", color: "#3b82f6" });
    for (const [index, title] of ["Angebot", "Entwurf", "Rechnung"].entries()) {
      const task = await createMyTask(db, ada, { projectId: project.id, title, dueDate: "2030-01-15" });
      await setTaskAssignees(db, ada, task.id, [ada.id, mia.id]);
      if (index !== 1) await setTaskLabels(db, ada, task.id, [label.id]);
      const detail = (await getTaskDetail(db, ada, task.id))!;
      if (index === 0) await updateTask(db, ada, task.id, detail.updatedAt, { priority: "high" });
    }
    await saveAppointment(db, ada, { projectId: project.id, title: "Projektbesprechung", startsAt: "2030-01-15T09:30", endsAt: "2030-01-15T10:15" });
  } finally { await db.$client.end(); }

  await login(page);
  await page.getByRole("button", { name: "Filtern", exact: true }).click();
  await choose(page.getByLabel("Todos nach Projekt filtern"), "Persönlicher Tagesplan");
  await choose(page.getByLabel("Todos sortieren"), "Meine Reihenfolge");
  const work = page.getByRole("region", { name: "Meine Reihenfolge", exact: true });
  await expect(work.getByRole("listitem")).toHaveCount(3);
  await choose(page.getByLabel("Todos nach Label filtern"), "Fokus · PDP");
  await expect(work.getByRole("listitem")).toHaveCount(2);
  await choose(page.getByLabel("Todos nach Priorität filtern"), "Hoch");
  await expect(work.getByRole("listitem")).toHaveCount(1);
  await page.getByLabel("Meine Todos suchen").fill("kein Treffer");
  await expect(page.getByText(/Keine passenden Todos/)).toBeVisible();
  await page.getByRole("button", { name: "Filter zurücksetzen", exact: true }).click();
  await choose(page.getByLabel("Todos nach Projekt filtern"), "Persönlicher Tagesplan");
  await expect(work.getByRole("listitem")).toHaveCount(3);
  await work.getByRole("button", { name: "PDP-3 nach oben", exact: true }).click();
  await expect(work.getByRole("listitem").nth(1)).toContainText("Rechnung");
  await page.reload();
  await expect(work.getByRole("listitem").nth(1)).toContainText("Rechnung");

  await work.getByRole("button", { name: "PDP-1 Zeitblock planen", exact: true }).click();
  const planner = page.getByRole("dialog", { name: "Zeitblock planen", exact: true });
  await planner.getByLabel("Titel", { exact: true }).fill("Fokus: Angebot");
  await planner.getByLabel("Tag", { exact: true }).fill("2030-01-15");
  await planner.getByLabel("Tag", { exact: true }).press("Enter");
  await planner.getByLabel("Beginn", { exact: true }).fill("09:00");
  await choose(planner.getByLabel("Dauer", { exact: true }), "90 Minuten");
  await planner.getByRole("button", { name: "Zeitblock speichern", exact: true }).click();
  await expect(planner).toBeHidden();
  await page.goto(`/calendar?view=day&date=2030-01-15&projects=${projectId}`);
  const timeline = page.getByRole("region", { name: /^Tageskalender/ });
  const grid = page.locator('[data-slot="day-timeline-scroll"]');
  const dimensions = await grid.evaluate((element) => ({ height: element.clientHeight, content: element.scrollHeight }));
  expect(dimensions.content).toBeGreaterThan(dimensions.height);
  const block = timeline.getByRole("button", { name: /^Zeitblock bearbeiten: Fokus: Angebot/ });
  const meeting = timeline.getByRole("link", { name: /^Termin: Projektbesprechung/ });
  await expect(block).toBeVisible();
  await expect(block).toContainText("09:00 – 10:30");
  expect((await block.boundingBox())!.x).not.toBe((await meeting.boundingBox())!.x);
  await block.click();
  const edit = page.getByRole("dialog", { name: "Zeitblock bearbeiten", exact: true });
  await edit.getByLabel("Beginn").fill("11:00");
  await choose(edit.getByLabel("Dauer"), "30 Minuten");
  await edit.getByRole("button", { name: "Zeitblock speichern" }).click();
  await expect(edit).toBeHidden();
  await expect(block).toContainText("11:00 – 11:30");
  await timeline.getByRole("button", { name: "Zeitblock am 2030-01-15 um 14:30 planen", exact: true }).click();
  await choose(planner.getByLabel("Aufgabe", { exact: true }), "PDP-2 Entwurf");
  await planner.getByRole("button", { name: "Zeitblock speichern" }).click();
  await expect(planner).toBeHidden();
  await expect(timeline.getByRole("button", { name: /^Zeitblock bearbeiten: Entwurf/ })).toContainText("14:30 – 15:30");
  await page.getByRole("link", { name: "Weiter", exact: true }).click();
  await expect(page).toHaveURL(/date=2030-01-16/);

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await login(otherPage, E2E_MEMBER.email, E2E_MEMBER.password);
  await otherPage.goto(`/calendar?view=day&date=2030-01-15&projects=${projectId}`);
  await expect(otherPage.getByRole("link", { name: /^Termin: Projektbesprechung/ })).toBeVisible();
  await expect(otherPage.getByRole("button", { name: /^Zeitblock bearbeiten:/ })).toHaveCount(0);
  expect(await otherPage.content()).not.toContain("Fokus: Angebot");
  await otherContext.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?workProject=${projectId}&workSort=manual`);
  await expect(work.getByRole("listitem")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await test.info().attach("mobile-my-work", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  await page.goto(`/calendar?view=day&date=2030-01-15&projects=${projectId}`);
  await expect(block).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await test.info().attach("mobile-day-calendar", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
