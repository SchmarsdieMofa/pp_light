import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authTokens, mailOutbox, users } from "@/server/db/schema";
import { openMailBody } from "@/server/mail/crypto";
import { verifyCredentials } from "@/server/users/service";
import { consumeAuthToken, inviteUser, requestPasswordReset, setUserActive, tokenIsValid } from "@/server/users/invitations";
import { resolveOidcUser } from "@/server/users/oidc";
import { resetDb, testDb } from "../helpers/db";
import { makeActor } from "../helpers/fixtures";

const inviteToken = async () => {
  const [mail] = await testDb.select().from(mailOutbox);
  return openMailBody(mail.body).match(/\/invite\/([\w-]+)/)![1];
};

describe("invitations and OIDC", () => {
  beforeEach(resetDb);

  it("restricts invitation to admins and consumes the hashed token once", async () => {
    const member = await makeActor("member@example.com");
    const admin = await makeActor("admin@example.com", "admin");
    await expect(inviteUser(testDb, member, { email: "new@example.com", name: "New", role: "member" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await inviteUser(testDb, admin, { email: " NEW@example.com ", name: "New", role: "member" });
    const token = await inviteToken();
    const [stored] = await testDb.select().from(authTokens);
    expect(stored.tokenHash).not.toBe(token);
    expect((await testDb.select().from(mailOutbox))[0].body).not.toContain(token);
    expect(await tokenIsValid(testDb, token, "invite")).toBe(true);
    await consumeAuthToken(testDb, token, "invite", "StrongPassword123!");
    expect(await tokenIsValid(testDb, token, "invite")).toBe(false);
    await expect(consumeAuthToken(testDb, token, "invite", "StrongPassword123!")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await verifyCredentials(testDb, "new@example.com", "StrongPassword123!")).toBeTruthy();
  });

  it("does not reveal unknown reset addresses and rejects expired tokens", async () => {
    const admin = await makeActor("admin@example.com", "admin");
    await requestPasswordReset(testDb, "missing@example.com");
    expect(await testDb.select().from(mailOutbox)).toHaveLength(0);
    await requestPasswordReset(testDb, admin.email);
    const [mail] = await testDb.select().from(mailOutbox);
    const token = openMailBody(mail.body).match(/\/reset\/([\w-]+)/)![1];
    expect(await tokenIsValid(testDb, token, "reset")).toBe(true);
    await testDb.update(authTokens).set({ expiresAt: new Date(0) });
    expect(await tokenIsValid(testDb, token, "reset")).toBe(false);
    await expect(consumeAuthToken(testDb, token, "reset", "StrongPassword123!")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("links only verified OIDC email and honors invitation or allowed domain", async () => {
    const admin = await makeActor("admin@example.com", "admin");
    const profile = { subject: "sub-1", email: admin.email, emailVerified: false };
    expect(await resolveOidcUser(testDb, profile, [])).toBeNull();
    expect(await resolveOidcUser(testDb, { ...profile, emailVerified: true }, [])).toBe(admin.id);
    expect(await resolveOidcUser(testDb, { ...profile, email: "different@example.com", emailVerified: true }, [])).toBe(admin.id);
    expect(await resolveOidcUser(testDb, { subject: "sub-2", email: "unknown@example.com", emailVerified: true }, [])).toBeNull();
    await inviteUser(testDb, admin, { email: "invite@example.com", name: "Invited", role: "member" });
    const invitedId = await resolveOidcUser(testDb, { subject: "sub-3", email: "invite@example.com", emailVerified: true }, []);
    expect(invitedId).toBeTruthy();
    expect((await testDb.select().from(users).where(eq(users.id, invitedId!)))[0].active).toBe(true);
    expect(await resolveOidcUser(testDb, { subject: "sub-4", email: "allowed@example.org", emailVerified: true }, ["example.org"])).toBeTruthy();
  });

  it("prevents an admin from deactivating their own session", async () => {
    const admin = await makeActor("admin@example.com", "admin");
    const member = await makeActor("member@example.com");
    await expect(setUserActive(testDb, admin, admin.id, false)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setUserActive(testDb, member, admin.id, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await setUserActive(testDb, admin, member.id, false);
    expect((await testDb.select().from(users).where(eq(users.id, member.id)))[0].active).toBe(false);
  });
});
