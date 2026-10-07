import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { mentionToken } from "@/lib/mentions";
import { tasks } from "@/server/db/schema";
import { archiveProject } from "@/server/projects/lifecycle";
import { listNotifications } from "@/server/notifications/service";
import {
  askQuestion,
  countOpenQuestions,
  createTaskFromQuestion,
  deletePost,
  deleteQuestion,
  editPost,
  getQuestion,
  listQuestions,
  postAnswer,
  renameQuestion,
  reopenQuestion,
  resolveQuestion,
} from "@/server/questions/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

const forbidden = { code: "FORBIDDEN" };
const notFound = { code: "NOT_FOUND" };

async function setup() {
  const ada = await makeActor("ada@example.com");
  const mia = await makeActor("mia@example.com");
  const gus = await makeActor("gus@example.com");
  const fremd = await makeActor("fremd@example.com");
  const { project } = await makeProject(ada, "FRG");
  await addMember(project.id, mia, "member");
  await addMember(project.id, gus, "guest");
  return { ada, mia, gus, fremd, project };
}

describe("questions", () => {
  beforeEach(resetDb);

  it("lets everyone in the project ask, answer, close and reopen – guests included", async () => {
    const { mia, gus, project } = await setup();
    const { id } = await askQuestion(testDb, gus, project.id, { title: "  Welche Farbe?  ", body: "Blau oder grün?" });
    await postAnswer(testDb, mia, id, "Blau.");
    await resolveQuestion(testDb, gus, id, "Blau.");
    let detail = (await getQuestion(testDb, mia, id))!;
    expect(detail).toMatchObject({ title: "Welche Farbe?", status: "resolved", summary: "Blau.", resolvedByName: "gus", postCount: 2 });
    expect(detail.posts.map((p) => [p.authorName, p.body, p.isQuestion])).toEqual([["gus", "Blau oder grün?", true], ["mia", "Blau.", false]]);
    await reopenQuestion(testDb, mia, id);
    detail = (await getQuestion(testDb, mia, id))!;
    expect(detail).toMatchObject({ status: "open", resolvedAt: null, resolvedByName: null, summary: "Blau." });
    expect(await countOpenQuestions(testDb, project.id)).toBe(1);
  });

  it("needs a summary to close and validates input", async () => {
    const { ada, project } = await setup();
    await expect(askQuestion(testDb, ada, project.id, { title: " ", body: "x" })).rejects.toBeInstanceOf(ZodError);
    await expect(askQuestion(testDb, ada, project.id, { title: "x", body: "  " })).rejects.toBeInstanceOf(ZodError);
    const { id } = await askQuestion(testDb, ada, project.id, { title: "Frage", body: "Text" });
    await expect(resolveQuestion(testDb, ada, id, "   ")).rejects.toBeInstanceOf(ZodError);
    expect((await getQuestion(testDb, ada, id))!.status).toBe("open");
    await expect(postAnswer(testDb, ada, "kaputt", "x")).rejects.toMatchObject(notFound);
  });

  it("hides questions from people outside the project", async () => {
    const { ada, fremd, project } = await setup();
    const { id } = await askQuestion(testDb, ada, project.id, { title: "Intern", body: "Text" });
    expect(await getQuestion(testDb, fremd, id)).toBeNull();
    await expect(listQuestions(testDb, fremd, project.id)).rejects.toMatchObject(notFound);
    await expect(askQuestion(testDb, fremd, project.id, { title: "x", body: "y" })).rejects.toMatchObject(notFound);
    await expect(postAnswer(testDb, fremd, id, "x")).rejects.toMatchObject(notFound);
    await expect(resolveQuestion(testDb, fremd, id, "x")).rejects.toMatchObject(notFound);
  });

  it("lists by recent activity with an open/resolved filter", async () => {
    const { ada, project } = await setup();
    const first = await askQuestion(testDb, ada, project.id, { title: "Eins", body: "a" });
    const second = await askQuestion(testDb, ada, project.id, { title: "Zwei", body: "b" });
    expect((await listQuestions(testDb, ada, project.id)).map((q) => q.title)).toEqual(["Zwei", "Eins"]);
    await postAnswer(testDb, ada, first.id, "neu");
    expect((await listQuestions(testDb, ada, project.id)).map((q) => q.title)).toEqual(["Eins", "Zwei"]);
    await resolveQuestion(testDb, ada, second.id, "fertig");
    expect((await listQuestions(testDb, ada, project.id, "open")).map((q) => q.title)).toEqual(["Eins"]);
    expect((await listQuestions(testDb, ada, project.id, "resolved")).map((q) => [q.title, q.postCount])).toEqual([["Zwei", 1]]);
  });

  it("edits only own posts; the author or an owner removes posts, renames and deletes", async () => {
    const { ada, mia, gus, project } = await setup();
    const { id } = await askQuestion(testDb, mia, project.id, { title: "Von Mia", body: "Text" });
    await postAnswer(testDb, gus, id, "Antwort von Gus");
    await postAnswer(testDb, mia, id, "Nachtrag");
    const [question, byGus, byMia] = (await getQuestion(testDb, mia, id))!.posts;
    await editPost(testDb, mia, question.id, "Neuer Text");
    await expect(editPost(testDb, ada, byGus.id, "Gekapert")).rejects.toMatchObject(forbidden);
    await expect(editPost(testDb, mia, byGus.id, "Gekapert")).rejects.toMatchObject(forbidden);
    expect((await getQuestion(testDb, mia, id))!.posts[0]).toMatchObject({ body: "Neuer Text" });
    expect((await getQuestion(testDb, mia, id))!.posts[0].editedAt).not.toBeNull();

    await expect(deletePost(testDb, gus, byMia.id)).rejects.toMatchObject(forbidden);
    await deletePost(testDb, ada, byGus.id); // project owner
    await deletePost(testDb, mia, byMia.id); // author
    await expect(deletePost(testDb, mia, question.id)).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await getQuestion(testDb, mia, id))!.posts).toHaveLength(1);

    await expect(renameQuestion(testDb, gus, id, "Gekapert")).rejects.toMatchObject(forbidden);
    await renameQuestion(testDb, ada, id, "Umbenannt");
    await expect(deleteQuestion(testDb, gus, id)).rejects.toMatchObject(forbidden);
    expect((await getQuestion(testDb, gus, id))!).toMatchObject({ title: "Umbenannt", canManage: false, canWrite: true });
    expect((await getQuestion(testDb, mia, id))!.canManage).toBe(true);
    await deleteQuestion(testDb, mia, id);
    expect(await getQuestion(testDb, mia, id)).toBeNull();
  });

  it("notifies the right people", async () => {
    const { ada, mia, gus, project } = await setup();
    const messages = async (actor: typeof ada) => (await listNotifications(testDb, actor)).map((n) => [n.type, n.questionId !== null]);

    // A new question reaches only the mentioned.
    const { id } = await askQuestion(testDb, mia, project.id, { title: "Offen", body: `Was meinst du, ${mentionToken("gus", gus.id)}?` });
    expect(await messages(gus)).toEqual([["mentioned", true]]);
    expect(await messages(ada)).toEqual([]);

    // An answer reaches the asker and earlier writers; the actor never notifies themselves.
    await postAnswer(testDb, gus, id, "Ich denke ja.");
    expect(await messages(mia)).toEqual([["question", true]]);
    await postAnswer(testDb, ada, id, `Danke ${mentionToken("mia", mia.id)}`);
    expect((await messages(mia)).map(([type]) => type).sort()).toEqual(["mentioned", "question"]);
    expect((await messages(gus)).map(([type]) => type).sort()).toEqual(["mentioned", "question"]);
    expect(await messages(ada)).toEqual([]);

    // Resolving reaches the asker and the writers.
    await resolveQuestion(testDb, ada, id, "Erledigt.");
    expect((await messages(mia)).map(([type]) => type)).toContain("questionResolved");
    expect((await messages(gus)).map(([type]) => type)).toContain("questionResolved");
    expect((await listNotifications(testDb, mia)).find((n) => n.type === "questionResolved")!.message).toContain("als geklärt markiert");
  });

  it("does not notify mentioned people without access to the project", async () => {
    const { ada, fremd, project } = await setup();
    await askQuestion(testDb, ada, project.id, { title: "Geheim", body: `Hallo ${mentionToken("fremd", fremd.id)}` });
    expect(await listNotifications(testDb, fremd)).toEqual([]);
  });

  it("turns a question into a task with what was settled; guests cannot create tasks", async () => {
    const { ada, mia, gus, project } = await setup();
    const { id } = await askQuestion(testDb, gus, project.id, { title: "Wer macht das Impressum?", body: `Kann das ${mentionToken("mia", mia.id)} übernehmen?` });
    const open = await createTaskFromQuestion(testDb, mia, id);
    expect(open.reference).toBe("FRG-1");
    const [first] = await testDb.select().from(tasks).where(eq(tasks.id, open.id));
    expect(first).toMatchObject({ title: "Wer macht das Impressum?", projectId: project.id });
    expect(first.description).toBe("Aus der Frage „Wer macht das Impressum?“:\n\nKann das @mia übernehmen?");

    await resolveQuestion(testDb, ada, id, "Mia schreibt es bis Freitag.");
    const settled = await createTaskFromQuestion(testDb, ada, id);
    const [second] = await testDb.select().from(tasks).where(eq(tasks.id, settled.id));
    expect(second.description).toBe("Aus der Frage „Wer macht das Impressum?“:\n\nMia schreibt es bis Freitag.");

    await expect(createTaskFromQuestion(testDb, gus, id)).rejects.toMatchObject(forbidden);
    expect((await getQuestion(testDb, gus, id))!.canCreateTask).toBe(false);
    expect((await getQuestion(testDb, mia, id))!.canCreateTask).toBe(true);
  });

  it("is read-only in an archived project", async () => {
    const { ada, mia, project } = await setup();
    const { id } = await askQuestion(testDb, mia, project.id, { title: "Alt", body: "Text" });
    await archiveProject(testDb, ada, project.id);
    expect((await getQuestion(testDb, mia, id))!).toMatchObject({ title: "Alt", canWrite: false });
    await expect(postAnswer(testDb, mia, id, "x")).rejects.toMatchObject(forbidden);
    await expect(resolveQuestion(testDb, ada, id, "x")).rejects.toMatchObject(forbidden);
    await expect(askQuestion(testDb, ada, project.id, { title: "x", body: "y" })).rejects.toMatchObject(forbidden);
    expect((await listQuestions(testDb, mia, project.id)).map((q) => q.title)).toEqual(["Alt"]);
  });
});
