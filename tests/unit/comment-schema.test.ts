import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";
import { attachments, commentMentions, comments, tasks } from "@/server/db/schema";
import { createTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { makeActor, makeProject } from "../helpers/fixtures";

describe("comment and attachment schema", () => {
  beforeEach(resetDb);

  it("stores comments, mentions and attachments and removes them with the task", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "CMT");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    const [comment] = await testDb.insert(comments).values({ taskId: task.id, authorId: ada.id, body: "Hallo" }).returning();
    expect(comment.editedAt).toBeNull();
    await testDb.insert(commentMentions).values({ commentId: comment.id, userId: ada.id });
    await testDb.insert(attachments).values({
      taskId: task.id,
      filename: "a.txt",
      mime: "text/plain",
      size: 3,
      storageKey: "k1",
      uploadedBy: ada.id,
    });
    await testDb.delete(tasks).where(eq(tasks.id, task.id));
    expect(await testDb.select().from(comments)).toHaveLength(0);
    expect(await testDb.select().from(commentMentions)).toHaveLength(0);
    expect(await testDb.select().from(attachments)).toHaveLength(0);
  });
});

describe("upload config", () => {
  it("defaults UPLOAD_DIR to ./data/uploads", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://x", AUTH_SECRET: "x".repeat(32) });
    expect(env.UPLOAD_DIR).toBe("./data/uploads");
  });
});
