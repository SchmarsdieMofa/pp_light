import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { mentionToken, parseMentionIds } from "@/lib/mentions";
import { listActivity } from "@/server/activity/service";
import { createComment, deleteComment, listComments, updateComment } from "@/server/comments/service";
import { createTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("mentions", () => {
  it("builds and parses mention tokens, deduplicated", () => {
    const token = mentionToken("Ada [Admin]", UUID);
    expect(token).toBe(`@[Ada Admin](user:${UUID})`);
    expect(parseMentionIds(`Hi ${token} und nochmal ${token}`)).toEqual([UUID]);
  });

  it("ignores malformed tokens", () => {
    expect(parseMentionIds("@[x](user:kaputt) @[y](mailto:a@b.de) @Ada")).toEqual([]);
  });
});

async function setup() {
  const ada = await makeActor("ada@example.com");
  const gast = await makeActor("gast@example.com");
  const fremd = await makeActor("fremd@example.com");
  const { project } = await makeProject(ada, "CMT");
  await addMember(project.id, gast, "guest");
  const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
  return { ada, gast, fremd, project, task };
}

describe("comments", () => {
  beforeEach(resetDb);

  it("lets guests comment and stores mentions of members only", async () => {
    const { ada, gast, fremd, task } = await setup();
    const body = `Bitte ansehen ${mentionToken("Ada", ada.id)} und ${mentionToken("Fremd", fremd.id)}`;
    const comment = await createComment(testDb, gast, task.id, `  ${body} `);
    expect(comment.body).toBe(body);
    const [listed] = await listComments(testDb, task.id);
    expect(listed).toMatchObject({ id: comment.id, authorId: gast.id, authorName: "gast", mentionIds: [ada.id], editedAt: null });
    expect((await listActivity(testDb, task.id)).at(-1)).toMatchObject({ action: "comment.added" });
  });

  it("lets only the author edit and re-syncs mentions", async () => {
    const { ada, gast, task } = await setup();
    const comment = await createComment(testDb, gast, task.id, `Hallo ${mentionToken("Ada", ada.id)}`);
    await expect(updateComment(testDb, ada, comment.id, "Übernommen")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await updateComment(testDb, gast, comment.id, "Ohne Erwähnung");
    const [listed] = await listComments(testDb, task.id);
    expect(listed.body).toBe("Ohne Erwähnung");
    expect(listed.mentionIds).toEqual([]);
    expect(listed.editedAt).not.toBeNull();
  });

  it("lets authors and owners delete, nobody else", async () => {
    const { ada, gast, task, project } = await setup();
    const mia = await makeActor("mia@example.com");
    await addMember(project.id, mia, "member");
    const byGuest = await createComment(testDb, gast, task.id, "Gast");
    const byMia = await createComment(testDb, mia, task.id, "Mia");
    await expect(deleteComment(testDb, gast, byMia.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteComment(testDb, gast, byGuest.id);
    await deleteComment(testDb, ada, byMia.id);
    expect(await listComments(testDb, task.id)).toEqual([]);
  });

  it("validates text, ids and hides tasks from outsiders", async () => {
    const { ada, fremd, task } = await setup();
    await expect(createComment(testDb, ada, task.id, "   ")).rejects.toBeInstanceOf(ZodError);
    await expect(createComment(testDb, fremd, task.id, "Hallo")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateComment(testDb, ada, "kaputt", "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const comment = await createComment(testDb, ada, task.id, "Hallo");
    await expect(deleteComment(testDb, fremd, comment.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
