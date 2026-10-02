import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { listBackupRuns, requestBackup } from "@/server/backups/service";
import { backupRuns } from "@/server/db/schema";
import { resetDb, testDb } from "../helpers/db";
import { makeActor } from "../helpers/fixtures";

describe("backups", () => {
  beforeEach(resetDb);

  it("lets admins queue one backup at a time and lists the runs", async () => {
    const root = await makeActor("root@example.com", "admin");
    await requestBackup(testDb, root);
    await expect(requestBackup(testDb, root)).rejects.toMatchObject({ code: "CONFLICT" });

    const [run] = await listBackupRuns(testDb, root);
    expect(run).toMatchObject({ trigger: "manual", status: "pending", requestedByName: "root" });

    // What the backup container does: claim, finish – then the next one may be queued.
    await testDb.update(backupRuns).set({ status: "done", name: "2026-10-02_1400", sizeBytes: 3_000_000_000 }).where(eq(backupRuns.id, run.id));
    await requestBackup(testDb, root);
    const runs = await listBackupRuns(testDb, root);
    expect(runs.map((r) => r.status)).toEqual(["pending", "done"]);
    expect(runs[1].sizeBytes).toBe(3_000_000_000);
  });

  it("keeps members out", async () => {
    const mia = await makeActor("mia@example.com");
    await expect(requestBackup(testDb, mia)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listBackupRuns(testDb, mia)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
