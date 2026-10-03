import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { httpsRedirect, requestOrigin, requestProto } from "@/lib/access-redirect";
import { appSettings, users } from "@/server/db/schema";
import { getAppSettings, getBaseUrl, normalizeBaseUrl, setBaseUrl, setHttpsOnly } from "@/server/settings/service";
import { completeSetup, hasUsers, issueSetupCode, newSetupCode } from "@/server/setup/service";
import { resetDb, testDb } from "../helpers/db";
import { makeActor } from "../helpers/fixtures";

const admin = { name: "Ada Admin", email: "Ada@Example.com", password: "ein-langes-passwort", baseUrl: "https://pp.firma.local" };

describe("first-run setup", () => {
  beforeEach(resetDb);

  it("creates codes like ABCD-EFGH without look-alike characters", () => {
    for (let i = 0; i < 50; i++) expect(newSetupCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("sets up the first admin with the current code and forgets the code", async () => {
    expect(await hasUsers(testDb)).toBe(false);
    const old = (await issueSetupCode(testDb))!;
    const code = (await issueSetupCode(testDb))!;
    expect(code).not.toBe(old);

    await expect(completeSetup(testDb, { ...admin, code: old })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Case and missing dash do not matter.
    const user = await completeSetup(testDb, { ...admin, code: code.toLowerCase().replace("-", "") });
    expect(user).toMatchObject({ email: "ada@example.com", role: "admin", active: true });
    expect(await hasUsers(testDb)).toBe(true);
    expect(await getAppSettings(testDb)).toEqual({ httpsOnly: false, baseUrl: "https://pp.firma.local" });
    const [row] = await testDb.select().from(appSettings);
    expect(row.setupCodeHash).toBeNull();
  });

  it("refuses a second setup and issues no code once someone exists", async () => {
    const code = (await issueSetupCode(testDb))!;
    await completeSetup(testDb, { ...admin, code });
    await expect(completeSetup(testDb, { ...admin, email: "eve@example.com", code })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await issueSetupCode(testDb)).toBeNull();
    expect(await testDb.select().from(users)).toHaveLength(1);
  });

  it("lets only one of two simultaneous setups through", async () => {
    const code = (await issueSetupCode(testDb))!;
    const results = await Promise.allSettled([
      completeSetup(testDb, { ...admin, code }),
      completeSetup(testDb, { ...admin, email: "eve@example.com", code }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await testDb.select().from(users)).toHaveLength(1);
  });

  it("validates the admin's details", async () => {
    const code = (await issueSetupCode(testDb))!;
    await expect(completeSetup(testDb, { ...admin, code, password: "zu-kurz" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(completeSetup(testDb, { ...admin, code, email: "kein-mail" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(completeSetup(testDb, { ...admin, code, name: " " })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("access settings", () => {
  beforeEach(resetDb);
  const appUrl = process.env.APP_URL;
  afterEach(() => {
    if (appUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = appUrl;
  });

  it("switches HTTPS-only on only from a request that came in over HTTPS", async () => {
    const root = await makeActor("root@example.com", "admin");
    await expect(setHttpsOnly(testDb, root, true, "http")).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await getAppSettings(testDb)).httpsOnly).toBe(false);
    await setHttpsOnly(testDb, root, true, "https");
    expect((await getAppSettings(testDb)).httpsOnly).toBe(true);
    // Switching off always works – it is the way out.
    await setHttpsOnly(testDb, root, false, "http");
    expect((await getAppSettings(testDb)).httpsOnly).toBe(false);
  });

  it("stores a clean base URL and falls back to APP_URL", async () => {
    const root = await makeActor("root@example.com", "admin");
    process.env.APP_URL = "http://fallback:3000/";
    expect(await getBaseUrl(testDb)).toBe("http://fallback:3000");
    await setBaseUrl(testDb, root, " https://PP.firma.local/ ");
    expect(await getBaseUrl(testDb)).toBe("https://pp.firma.local");
    expect(normalizeBaseUrl("http://10.0.0.5:8080")).toBe("http://10.0.0.5:8080");
    for (const bad of ["ftp://x", "pp.firma.local", "https://x/pfad", "https://user:pw@x"]) {
      expect(() => normalizeBaseUrl(bad)).toThrow();
    }
  });

  it("keeps members out", async () => {
    const mia = await makeActor("mia@example.com");
    await expect(setHttpsOnly(testDb, mia, false, "https")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setBaseUrl(testDb, mia, "https://x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.select().from(appSettings).where(eq(appSettings.id, 1))).toHaveLength(0);
  });
});

describe("access redirect", () => {
  const headers = (h: Record<string, string>) => new Headers(h);

  it("reads the scheme Caddy forwarded, else the URL's", () => {
    expect(requestProto(headers({ "x-forwarded-proto": "https" }), "http:")).toBe("https");
    expect(requestProto(headers({ "x-forwarded-proto": "http" }), "https:")).toBe("http");
    expect(requestProto(headers({}), "https:")).toBe("https");
    expect(requestOrigin(headers({ "x-forwarded-proto": "https", host: "pp.firma.local" }), "http://app:3000/x")).toBe("https://pp.firma.local");
    expect(requestOrigin(headers({}), "http://localhost:3000/setup")).toBe("http://localhost:3000");
  });

  it("redirects only forwarded plain HTTP when HTTPS-only is on", () => {
    const url = "http://app:3000/projects?x=1";
    expect(httpsRedirect(true, headers({ "x-forwarded-proto": "http", host: "pp.firma.local" }), url)).toBe("https://pp.firma.local/projects?x=1");
    expect(httpsRedirect(true, headers({ "x-forwarded-proto": "https", host: "pp.firma.local" }), url)).toBeNull();
    expect(httpsRedirect(false, headers({ "x-forwarded-proto": "http", host: "pp.firma.local" }), url)).toBeNull();
    // Healthcheck and `next dev` talk to the app directly, without Caddy – never redirected.
    expect(httpsRedirect(true, headers({ host: "127.0.0.1:3000" }), url)).toBeNull();
    // Port 80 in the host does not travel to the HTTPS address.
    expect(httpsRedirect(true, headers({ "x-forwarded-proto": "http", host: "pp.firma.local:80" }), url)).toBe("https://pp.firma.local/projects?x=1");
  });
});
