import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { tasks } from "@/server/db/schema";
import { listPhases } from "@/server/phases/queries";
import { createPhase, deletePhase, movePhase, updatePhase } from "@/server/phases/service";
import { createTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

const emptyDates = { startDate: null, endDate: null, isMilestone: false };

describe("project phases", () => {
  beforeEach(resetDb);

  it("creates, edits and reorders phases and milestones", async () => {
    const owner = await makeActor("phase-owner@example.com");
    const { project } = await makeProject(owner, "PHA");
    const planning = await createPhase(testDb, owner, project.id, { name: "Planung", ...emptyDates });
    const delivery = await createPhase(testDb, owner, project.id, { name: "Lieferung", ...emptyDates });
    await updatePhase(testDb, owner, delivery.id, {
      name: "Freigabe", startDate: "2026-10-15", endDate: "2026-10-15", isMilestone: true,
    });
    await movePhase(testDb, owner, delivery.id, "left");
    expect((await listPhases(testDb, project.id)).map((phase) => phase.name)).toEqual(["Freigabe", "Planung"]);
    await movePhase(testDb, owner, planning.id, "right");
    expect((await listPhases(testDb, project.id)).map((phase) => phase.name)).toEqual(["Freigabe", "Planung"]);
  });

  it("rejects invalid dates, duplicate names and ordinary members", async () => {
    const owner = await makeActor("owner@example.com");
    const member = await makeActor("member@example.com");
    const { project } = await makeProject(owner, "VAL");
    await addMember(project.id, member, "member");
    await createPhase(testDb, owner, project.id, { name: "Planung", ...emptyDates });
    await expect(createPhase(testDb, owner, project.id, { name: "planung", ...emptyDates })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createPhase(testDb, member, project.id, { name: "X", ...emptyDates })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createPhase(testDb, owner, project.id, {
      name: "Falsch", startDate: "2026-10-10", endDate: "2026-10-09", isMilestone: false,
    })).rejects.toThrow();
    await expect(createPhase(testDb, owner, project.id, {
      name: "Ohne Tag", startDate: null, endDate: null, isMilestone: true,
    })).rejects.toThrow();
  });

  it("assigns only phases in the same project and clears assignments on deletion", async () => {
    const owner = await makeActor("assignment@example.com");
    const { project } = await makeProject(owner, "ASN");
    const other = await makeProject(owner, "OTH");
    const ownPhase = await createPhase(testDb, owner, project.id, { name: "Planung", ...emptyDates });
    const foreign = await createPhase(testDb, owner, other.project.id, { name: "Fremd", ...emptyDates });
    const task = await createTask(testDb, owner, { projectId: project.id, title: "A" });
    await expect(updateTask(testDb, owner, task.id, task.updatedAt.toISOString(), { phaseId: foreign.id })).rejects.toMatchObject({ code: "VALIDATION" });
    const assigned = await updateTask(testDb, owner, task.id, task.updatedAt.toISOString(), { phaseId: ownPhase.id });
    expect(assigned.phaseId).toBe(ownPhase.id);
    await deletePhase(testDb, owner, ownPhase.id);
    const [remaining] = await testDb.select({ phaseId: tasks.phaseId }).from(tasks).where(eq(tasks.id, task.id));
    expect(remaining.phaseId).toBeNull();
  });
});
