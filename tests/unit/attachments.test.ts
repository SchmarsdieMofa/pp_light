import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { listActivity } from "@/server/activity/service";
import {
  contentDisposition,
  deleteAttachment,
  getAttachmentForDownload,
  isInlineImage,
  listAttachments,
  safeFilename,
  saveAttachment,
} from "@/server/attachments/service";
import { createTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("attachment helpers", () => {
  it("cleans file names from paths, control characters and quotes", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("C:\\Users\\x\\Bericht.pdf")).toBe("Bericht.pdf");
    expect(safeFilename('a"b\r\nc.txt')).toBe("abc.txt");
    expect(safeFilename("   ")).toBe("datei");
  });

  it("builds RFC 5987 content dispositions", () => {
    expect(contentDisposition("Größe 100%.pdf", false)).toBe(
      `attachment; filename="Gr__e 100_.pdf"; filename*=UTF-8''Gr%C3%B6%C3%9Fe%20100%25.pdf`,
    );
    expect(contentDisposition("bild.png", true)).toMatch(/^inline; /);
  });

  it("allows inline display only for raster images", () => {
    expect(isInlineImage("image/png")).toBe(true);
    expect(isInlineImage("image/svg+xml")).toBe(false);
    expect(isInlineImage("text/html")).toBe(false);
  });
});

describe("attachments", () => {
  let uploadDir: string;
  const opts = () => ({ uploadDir, maxBytes: 10 });

  beforeEach(async () => {
    await resetDb();
    uploadDir = mkdtempSync(join(tmpdir(), "pp-uploads-"));
  });

  async function setup() {
    const ada = await makeActor("ada@example.com");
    const gast = await makeActor("gast@example.com");
    const fremd = await makeActor("fremd@example.com");
    const { project } = await makeProject(ada, "ATT");
    await addMember(project.id, gast, "guest");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    return { ada, gast, fremd, project, task };
  }

  it("stores the file under a random key and serves it to project members", async () => {
    const { ada, gast, task } = await setup();
    const attachment = await saveAttachment(testDb, ada, task.id, { name: "../geheim.txt", type: "text/plain", data: bytes("Hallo") }, opts());
    expect(attachment.filename).toBe("geheim.txt");
    expect(attachment.size).toBe(5);
    expect(attachment.storageKey).not.toContain("geheim");
    expect(readdirSync(uploadDir)).toEqual([attachment.storageKey]);

    const download = await getAttachmentForDownload(testDb, gast, attachment.id, uploadDir);
    expect(readFileSync(download.path, "utf8")).toBe("Hallo");
    expect((await listAttachments(testDb, task.id)).map((a) => a.filename)).toEqual(["geheim.txt"]);
    expect((await listActivity(testDb, task.id)).at(-1)).toMatchObject({ action: "attachment.added" });
  });

  it("rejects empty and too large files without leaving files behind", async () => {
    const { ada, task } = await setup();
    await expect(saveAttachment(testDb, ada, task.id, { name: "leer.txt", type: "text/plain", data: bytes("") }, opts())).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      saveAttachment(testDb, ada, task.id, { name: "gross.txt", type: "text/plain", data: bytes("x".repeat(11)) }, opts()),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
    expect(readdirSync(uploadDir)).toEqual([]);
  });

  it("falls back to a generic type for odd mime strings", async () => {
    const { ada, task } = await setup();
    const attachment = await saveAttachment(testDb, ada, task.id, { name: "x", type: "text/html\r\nX-Evil: 1", data: bytes("x") }, opts());
    expect(attachment.mime).toBe("application/octet-stream");
  });

  it("enforces upload, download and delete permissions", async () => {
    const { ada, gast, fremd, task } = await setup();
    await expect(saveAttachment(testDb, gast, task.id, { name: "g.txt", type: "text/plain", data: bytes("g") }, opts())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const attachment = await saveAttachment(testDb, ada, task.id, { name: "a.txt", type: "text/plain", data: bytes("a") }, opts());
    await expect(getAttachmentForDownload(testDb, fremd, attachment.id, uploadDir)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getAttachmentForDownload(testDb, ada, "kaputt", uploadDir)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteAttachment(testDb, gast, attachment.id, uploadDir)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteAttachment(testDb, ada, attachment.id, uploadDir);
    expect(existsSync(join(uploadDir, attachment.storageKey))).toBe(false);
    expect(await listAttachments(testDb, task.id)).toEqual([]);
  });
});
