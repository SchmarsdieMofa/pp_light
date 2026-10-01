import { parseArgs } from "node:util";
import { and, eq } from "drizzle-orm";
import { addChecklistItem } from "../src/server/checklists/service";
import { saveAttachment } from "../src/server/attachments/service";
import { createComment } from "../src/server/comments/service";
import { createDb } from "../src/server/db/client";
import { attachments, checklistItems, comments, notifications, projects, tasks, users } from "../src/server/db/schema";
import { createLabel, listLabels } from "../src/server/labels/service";
import { createProject, listStatuses } from "../src/server/projects/service";
import { setTaskAssignees, setTaskLabels } from "../src/server/tasks/relations";
import { createTask, updateTask } from "../src/server/tasks/service";
import { createUser, verifyCredentials } from "../src/server/users/service";

const email = "demo@pp-light.local";
const projectKey = "DEMO";

function day(offset: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const { values } = parseArgs({ options: { password: { type: "string" } } });
  if (!values.password || values.password.length < 10) throw new Error("--password mit mindestens 10 Zeichen angeben.");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL fehlt.");
  const database = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(database.hostname) || database.pathname !== "/pp_light") {
    throw new Error("Demo-Daten dürfen nur in der lokalen pp_light-Datenbank angelegt werden.");
  }
  const db = createDb(url);
  try {
    let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) user = await createUser(db, { email, name: "Demo User", password: values.password, role: "admin" });
    else if (!(await verifyCredentials(db, email, values.password))) {
      throw new Error("Der Demo-Zugang existiert bereits mit einem anderen Passwort.");
    }
    if (user.role !== "admin") {
      [user] = await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id)).returning();
    }
    const actor = { id: user.id, name: user.name, email: user.email, role: user.role };

    let [project] = await db.select().from(projects).where(eq(projects.key, projectKey)).limit(1);
    if (!project) {
      project = await createProject(db, actor, {
        name: "Demo-Projekt",
        key: projectKey,
        description: "Beispielprojekt zum Ausprobieren von Board, Liste und Aufgaben.",
      });
    } else if (project.createdBy !== user.id) {
      throw new Error("Das Projektkürzel DEMO gehört bereits zu einem anderen Nutzer.");
    }
    const statuses = await listStatuses(db, project.id);
    const status = (name: string) => {
      const found = statuses.find((item) => item.name === name);
      if (!found) throw new Error(`Status ${name} fehlt im Demo-Projekt.`);
      return found.id;
    };
    const existing = await db.select({ id: tasks.id, title: tasks.title, updatedAt: tasks.updatedAt }).from(tasks).where(eq(tasks.projectId, project.id));
    const byTitle = new Map(existing.map((task) => [task.title, task]));
    async function ensureTask(title: string, statusName: string, patch: Parameters<typeof updateTask>[4]) {
      const old = byTitle.get(title);
      if (old) return old.id;
      const task = await createTask(db, actor, { projectId: project.id, title, statusId: status(statusName) });
      await updateTask(db, actor, task.id, task.updatedAt.toISOString(), patch);
      await setTaskAssignees(db, actor, task.id, [user.id]);
      return task.id;
    }

    await ensureTask("Projektziel abstimmen", "Offen", {
      description: "Ziele, Umfang und Beteiligte für den Start festhalten.",
      dueDate: day(1),
      priority: "high",
    });
    const conceptId = await ensureTask("Konzept ausarbeiten", "In Arbeit", {
      description: "Die wichtigsten Abläufe skizzieren und offene Fragen sammeln.",
      startDate: day(-2),
      dueDate: day(4),
      priority: "med",
    });
    await ensureTask("Prototyp prüfen", "Review", {
      description: "Rückmeldungen zum ersten Entwurf dokumentieren.",
      dueDate: day(7),
    });
    await ensureTask("Erste Version freigeben", "Fertig", {
      description: "Beispiel einer abgeschlossenen Aufgabe.",
      dueDate: day(-3),
    });

    await db.insert(notifications).values([
      { userId: user.id, projectId: project.id, taskId: conceptId, type: "mentioned",
        message: "Demo: Du wurdest in DEMO-2 Konzept ausarbeiten erwähnt.", eventKey: `demo:mention:${user.id}` },
      { userId: user.id, projectId: project.id, taskId: conceptId, type: "status",
        message: "Demo: Der Status von DEMO-2 Konzept ausarbeiten wurde geändert.", eventKey: `demo:status:${user.id}` },
    ]).onConflictDoNothing();

    const labels = await listLabels(db, project.id);
    const focus = labels.find((label) => label.name === "Wichtig") ?? await createLabel(db, actor, { projectId: project.id, name: "Wichtig", color: "#ef4444" });
    await setTaskLabels(db, actor, conceptId, [focus.id]);
    const [check] = await db.select({ id: checklistItems.id }).from(checklistItems).where(and(eq(checklistItems.taskId, conceptId), eq(checklistItems.text, "Offene Fragen sammeln"))).limit(1);
    if (!check) await addChecklistItem(db, actor, conceptId, "Offene Fragen sammeln");

    const demoComment = "**M6-Demo:** Hier kannst du Kommentare mit Markdown und @Erwähnungen ausprobieren.";
    const [comment] = await db.select({ id: comments.id }).from(comments)
      .where(and(eq(comments.taskId, conceptId), eq(comments.body, demoComment))).limit(1);
    if (!comment) await createComment(db, actor, conceptId, demoComment);

    const demoFile = "demo-notiz.txt";
    const [attachment] = await db.select({ id: attachments.id }).from(attachments)
      .where(and(eq(attachments.taskId, conceptId), eq(attachments.filename, demoFile))).limit(1);
    if (!attachment) await saveAttachment(db, actor, conceptId, {
      name: demoFile,
      type: "text/plain",
      data: new TextEncoder().encode("Demo-Anhang zum Ausprobieren des Downloads.\n"),
    }, { uploadDir: process.env.UPLOAD_DIR ?? "./data/uploads", maxBytes: 1024 * 1024 });

    console.log(`Demo bereit: ${email} · Projekt: /projects/${project.id}/board`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
