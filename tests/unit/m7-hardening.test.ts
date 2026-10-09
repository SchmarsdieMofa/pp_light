import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeCredentials } from "@/server/auth/credentials";
import { resolveActor } from "@/server/auth/actor";
import { mailOutbox, notifications, users } from "@/server/db/schema";
import { openMailBody, sealMailBody } from "@/server/mail/crypto";
import { sendMail } from "@/server/mail/service";
import { sendPendingDigests, sendPendingOutbox } from "@/server/notifications/digest";
import { consumeAuthToken, inviteUser, requestPasswordReset, revokeInvitation, setUserActive, tokenIsValid } from "@/server/users/invitations";
import { resolveOidcUser } from "@/server/users/oidc";
import { createUser } from "@/server/users/service";
import { resetDb, testDb } from "../helpers/db";
import { makeActor, makeProject } from "../helpers/fixtures";

vi.mock("@/server/mail/service", () => ({ sendMail: vi.fn() }));

const lastToken = async (kind: "invite" | "reset") => {
  const mails = await testDb.select().from(mailOutbox);
  return openMailBody(mails.at(-1)!.body).match(new RegExp(`/${kind}/([\\w-]+)`))![1];
};

describe("account lifecycle hardening", () => {
  beforeEach(resetDb);

  it("revokes outstanding links on deactivation; a reset never reactivates", async () => {
    const admin = await makeActor("admin@example.com", "admin");
    const leaver = await createUser(testDb, { email: "leaver@example.com", name: "Leaver", password: "OldPassword123!" });
    await requestPasswordReset(testDb, leaver.email);
    const token = await lastToken("reset");
    await setUserActive(testDb, admin, leaver.id, false);
    expect(await tokenIsValid(testDb, token, "reset")).toBe(false);
    await expect(consumeAuthToken(testDb, token, "reset", "NewPassword123!")).rejects.toMatchObject({ code: "VALIDATION" });
    const [stored] = await testDb.select().from(users).where(eq(users.id, leaver.id));
    expect(stored.active).toBe(false);
  });

  it("lets admins revoke a pending invitation", async () => {
    const admin = await makeActor("admin@example.com", "admin");
    await inviteUser(testDb, admin, { email: "new@example.com", name: "New", role: "member" });
    const token = await lastToken("invite");
    const [invited] = await testDb.select().from(users).where(eq(users.email, "new@example.com"));
    const member = await makeActor("member@example.com");
    await expect(revokeInvitation(testDb, member, invited.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await revokeInvitation(testDb, admin, invited.id);
    expect(await tokenIsValid(testDb, token, "invite")).toBe(false);
  });

  it("ends existing sessions when the password is reset", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada", password: "OldPassword123!" });
    expect(await resolveActor(testDb, user.id, 0)).not.toBeNull();
    await requestPasswordReset(testDb, user.email);
    await consumeAuthToken(testDb, await lastToken("reset"), "reset", "NewPassword123!");
    expect(await resolveActor(testDb, user.id, 0)).toBeNull();
    expect(await resolveActor(testDb, user.id, 1)).not.toBeNull();
  });
});

describe("login throttling", () => {
  beforeEach(resetDb);

  it("locks an account after five failures, even for the right password", async () => {
    await createUser(testDb, { email: "ada@example.com", name: "Ada", password: "RightPassword123!" });
    const now = new Date("2026-10-01T10:00:00Z");
    for (let i = 0; i < 5; i++) {
      expect(await authorizeCredentials(testDb, { email: "ada@example.com", password: "falsch-falsch" }, "1.1.1.1", now)).toBeNull();
    }
    const locked = await authorizeCredentials(testDb, { email: "ADA@example.com", password: "RightPassword123!" }, "2.2.2.2", now);
    expect(locked).toMatchObject({ locked: true });
    const later = new Date(now.getTime() + 16 * 60_000);
    expect(await authorizeCredentials(testDb, { email: "ada@example.com", password: "RightPassword123!" }, "2.2.2.2", later)).toMatchObject({
      user: { email: "ada@example.com" },
    });
  });

  it("resets the counter after a successful login", async () => {
    await createUser(testDb, { email: "ada@example.com", name: "Ada", password: "RightPassword123!" });
    const now = new Date("2026-10-01T10:00:00Z");
    for (let i = 0; i < 4; i++) await authorizeCredentials(testDb, { email: "ada@example.com", password: "x" }, "1.1.1.1", now);
    expect(await authorizeCredentials(testDb, { email: "ada@example.com", password: "RightPassword123!" }, "1.1.1.1", now)).toMatchObject({ user: {} });
    for (let i = 0; i < 4; i++) await authorizeCredentials(testDb, { email: "ada@example.com", password: "x" }, "1.1.1.1", now);
    expect(await authorizeCredentials(testDb, { email: "ada@example.com", password: "RightPassword123!" }, "1.1.1.1", now)).toMatchObject({ user: {} });
  });

  it("blocks an IP that tries many different accounts", async () => {
    await createUser(testDb, { email: "ada@example.com", name: "Ada", password: "RightPassword123!" });
    const now = new Date("2026-10-01T10:00:00Z");
    for (let i = 0; i < 20; i++) {
      await authorizeCredentials(testDb, { email: `guess${i}@example.com`, password: "x" }, "6.6.6.6", now);
    }
    expect(await authorizeCredentials(testDb, { email: "ada@example.com", password: "RightPassword123!" }, "6.6.6.6", now)).toMatchObject({
      locked: true,
    });
    expect(await authorizeCredentials(testDb, { email: "ada@example.com", password: "RightPassword123!" }, "7.7.7.7", now)).toMatchObject({
      user: {},
    });
  });
});

describe("mail delivery isolation", () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(sendMail).mockReset();
  });

  it("keeps sending other mails when one fails and gives up after five attempts", async () => {
    await testDb.insert(mailOutbox).values({ toEmail: "bad@example.com", subject: "A", body: sealMailBody("A"), createdAt: new Date("2026-10-01T09:00:00Z") });
    await testDb.insert(mailOutbox).values({ toEmail: "good@example.com", subject: "B", body: sealMailBody("B"), createdAt: new Date("2026-10-01T09:01:00Z") });
    vi.mocked(sendMail).mockImplementation(async (to) => {
      if (to === "bad@example.com") throw new Error("550 mailbox unavailable");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendPendingOutbox(testDb)).toBe(1);
    const good = (await testDb.select().from(mailOutbox).where(eq(mailOutbox.toEmail, "good@example.com")))[0];
    expect(good.sentAt).not.toBeNull();
    expect(good.body).toBe("");
    for (let i = 0; i < 4; i++) await sendPendingOutbox(testDb);
    const bad = (await testDb.select().from(mailOutbox).where(eq(mailOutbox.toEmail, "bad@example.com")))[0];
    expect(bad.attempts).toBe(5);
    expect(bad.failedAt).not.toBeNull();
    expect(bad.lastError).toContain("550");
    vi.mocked(sendMail).mockClear();
    await sendPendingOutbox(testDb);
    expect(sendMail).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("keeps sending digests to other users when one fails", async () => {
    const ada = await makeActor("ada@example.com");
    const mia = await makeActor("mia@example.com");
    const { project } = await makeProject(ada, "DIG");
    for (const user of [ada, mia]) {
      await testDb.insert(notifications).values({ userId: user.id, projectId: user.id === ada.id ? project.id : null, type: "comment", message: "Hi", eventKey: `k-${user.id}` });
    }
    vi.mocked(sendMail).mockImplementation(async (to) => {
      if (to === "ada@example.com") throw new Error("SMTP down for ada");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendPendingDigests(testDb, new Date("2026-10-01T10:00:00Z"))).toBe(1);
    log.mockRestore();
  });
});

describe("OIDC sign-in", () => {
  beforeEach(resetDb);

  it("accepts an already linked subject without email_verified and trusts the issuer only when configured", async () => {
    const domains = ["firma.de"];
    const id = await resolveOidcUser(testDb, { subject: "sub-1", email: "ada@firma.de", name: "Ada", emailVerified: true }, domains);
    expect(id).not.toBeNull();
    expect(await resolveOidcUser(testDb, { subject: "sub-1", email: "ada@firma.de", emailVerified: false }, domains)).toBe(id);
    expect(await resolveOidcUser(testDb, { subject: "sub-2", email: "bob@firma.de", emailVerified: false }, domains)).toBeNull();
    expect(
      await resolveOidcUser(testDb, { subject: "sub-2", email: "bob@firma.de", emailVerified: false }, domains, { trustIssuerEmail: true }),
    ).not.toBeNull();
  });
});
