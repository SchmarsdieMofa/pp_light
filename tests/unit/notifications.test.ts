import { beforeEach, describe, expect, it } from "vitest";
import { mentionToken } from "@/lib/mentions";
import { createComment } from "@/server/comments/service";
import {
  createDueReminders, getNotificationPreferences, listNotifications, markAllNotificationsRead,
  markNotificationRead, setNotificationPreferences, unreadCount,
} from "@/server/notifications/service";
import { setTaskAssignees } from "@/server/tasks/relations";
import { createTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

describe("notifications", () => {
  beforeEach(resetDb);

  async function setup() {
    const ada = await makeActor("ada@example.com");
    const mia = await makeActor("mia@example.com");
    const outsider = await makeActor("outsider@example.com");
    const { project, done } = await makeProject(ada, "NTF");
    await addMember(project.id, mia, "member");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "Plan" });
    return { ada, mia, outsider, project, done, task };
  }

  it("notifies new assignees, but never the actor or outsiders", async () => {
    const { ada, mia, outsider, task } = await setup();
    await setTaskAssignees(testDb, ada, task.id, [mia.id]);
    expect((await listNotifications(testDb, mia)).map((n) => n.type)).toEqual(["assigned"]);
    expect(await unreadCount(testDb, mia)).toBe(1);
    expect(await unreadCount(testDb, ada)).toBe(0);
    expect(await listNotifications(testDb, outsider)).toEqual([]);
    const [notice] = await listNotifications(testDb, mia);
    await expect(markNotificationRead(testDb, outsider, notice.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await markNotificationRead(testDb, mia, notice.id);
    expect(await unreadCount(testDb, mia)).toBe(0);
  });

  it("prefers a mention over a comment notice and records status changes", async () => {
    const { ada, mia, task, done } = await setup();
    await setTaskAssignees(testDb, ada, task.id, [mia.id]);
    await createComment(testDb, ada, task.id, `Bitte prüfen ${mentionToken("Mia", mia.id)}`);
    const fresh = await testDb.query.tasks.findFirst({ where: (t, { eq }) => eq(t.id, task.id) });
    await updateTask(testDb, ada, task.id, fresh!.updatedAt.toISOString(), { statusId: done.id });
    expect((await listNotifications(testDb, mia)).map((n) => n.type)).toEqual(["status", "mentioned", "assigned"]);
    await markAllNotificationsRead(testDb, mia);
    expect(await unreadCount(testDb, mia)).toBe(0);
  });

  it("creates one due notice per user, task and day, including overdue reminders", async () => {
    const { ada, mia, project } = await setup();
    const soon = await createTask(testDb, ada, { projectId: project.id, title: "Morgen" });
    const late = await createTask(testDb, ada, { projectId: project.id, title: "Alt" });
    await updateTask(testDb, ada, soon.id, soon.updatedAt.toISOString(), { dueDate: "2026-10-02" });
    await updateTask(testDb, ada, late.id, late.updatedAt.toISOString(), { dueDate: "2026-09-30" });
    await setTaskAssignees(testDb, ada, soon.id, [mia.id]);
    await setTaskAssignees(testDb, ada, late.id, [mia.id]);
    const now = new Date("2026-10-01T08:00:00Z");
    expect(await createDueReminders(testDb, now)).toBe(2);
    expect(await createDueReminders(testDb, now)).toBe(0);
    expect((await listNotifications(testDb, mia)).map((n) => n.type).sort()).toEqual(["assigned", "assigned", "dueSoon", "overdue"]);
  });

  it("saves validated per-type email preferences", async () => {
    const { mia } = await setup();
    await setNotificationPreferences(testDb, mia.id, ["comment", "mentioned", "comment"]);
    expect(await getNotificationPreferences(testDb, mia.id)).toEqual(["comment", "mentioned"]);
    await expect(setNotificationPreferences(testDb, mia.id, ["other"])).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("turns assignment and status e-mails off until a person chooses otherwise", async () => {
    const { mia } = await setup();
    expect(await getNotificationPreferences(testDb, mia.id)).toEqual(["assigned", "status"]);
    await setNotificationPreferences(testDb, mia.id, []);
    expect(await getNotificationPreferences(testDb, mia.id)).toEqual([]);
  });
});
