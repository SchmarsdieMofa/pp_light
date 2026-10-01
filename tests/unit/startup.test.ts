import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { TEST_DATABASE_URL } from "../helpers/test-env";

// The container entrypoint runs scripts/migrate.ts first; a bad config must stop the start there.
function runMigrate(env: Record<string, string>) {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], {
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env },
    encoding: "utf8",
  });
}

describe("startup config check", () => {
  it("aborts migrations with the variable name when AUTH_SECRET is missing", () => {
    const res = runMigrate({ DATABASE_URL: TEST_DATABASE_URL });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/AUTH_SECRET/);
    expect(res.stdout).not.toMatch(/Migrationen ausgeführt/);
  }, 30_000);

  it("runs migrations with a valid config", () => {
    const res = runMigrate({ DATABASE_URL: TEST_DATABASE_URL, AUTH_SECRET: "x".repeat(32) });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/Migrationen ausgeführt/);
  }, 30_000);
});
