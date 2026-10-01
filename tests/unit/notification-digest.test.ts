import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { mailOutbox, notifications } from "@/server/db/schema";
import { sendMail } from "@/server/mail/service";
import { sealMailBody } from "@/server/mail/crypto";
import { sendPendingDigests, sendPendingOutbox } from "@/server/notifications/digest";
import { setNotificationPreferences } from "@/server/notifications/service";
import { resetDb, testDb } from "../helpers/db";
import { makeActor, makeProject } from "../helpers/fixtures";

vi.mock("@/server/mail/service", () => ({ sendMail: vi.fn() }));

describe("mail delivery", () => {
  beforeEach(async () => { await resetDb(); vi.mocked(sendMail).mockReset(); });

  it("sends at most one digest per user in ten minutes and honors disabled types", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "DIG");
    await testDb.insert(notifications).values({ userId: ada.id, projectId: project.id,
      type: "assigned", message: "First", eventKey: "first" });
    const start = new Date("2026-10-01T10:00:00Z");
    expect(await sendPendingDigests(testDb, start)).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    await testDb.insert(notifications).values({ userId: ada.id, projectId: project.id,
      type: "mentioned", message: "Second", eventKey: "second" });
    expect(await sendPendingDigests(testDb, new Date(start.getTime() + 9 * 60_000))).toBe(0);
    expect(await sendPendingDigests(testDb, new Date(start.getTime() + 10 * 60_000))).toBe(1);
    await setNotificationPreferences(testDb, ada.id, ["status"]);
    await testDb.insert(notifications).values({ userId: ada.id, projectId: project.id,
      type: "status", message: "Hidden", eventKey: "third" });
    expect(await sendPendingDigests(testDb, new Date(start.getTime() + 20 * 60_000))).toBe(0);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect((await testDb.select().from(notifications).where(eq(notifications.eventKey, "third")))[0].emailedAt).not.toBeNull();
  });

  it("keeps failed outbox mail pending for retry", async () => {
    await testDb.insert(mailOutbox).values({ toEmail: "ada@example.com", subject: "Invite", body: sealMailBody("Link") });
    vi.mocked(sendMail).mockRejectedValueOnce(new Error("SMTP unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendPendingOutbox(testDb)).toBe(0);
    log.mockRestore();
    expect((await testDb.select().from(mailOutbox))[0].sentAt).toBeNull();
    expect(await sendPendingOutbox(testDb)).toBe(1);
    expect((await testDb.select().from(mailOutbox))[0].sentAt).not.toBeNull();
  });
});
