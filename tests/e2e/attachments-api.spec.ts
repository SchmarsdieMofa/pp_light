import { expect, test } from "@playwright/test";
import { createProjectViaUi, login } from "./fixtures";

test("upload and download attachments with safe headers and access checks", async ({ page, browser }) => {
  await login(page);
  const board = await createProjectViaUi(page, "Datei-API", "dat");
  const input = page.getByLabel("Neue Aufgabe in Offen");
  await input.fill("Mit Datei");
  await input.press("Enter");
  await page.getByRole("region", { name: "Offen" }).getByRole("link", { name: /Mit Datei/ }).click();
  await expect(page).toHaveURL(/task=/);
  const taskId = new URL(page.url()).searchParams.get("task")!;

  const empty = await page.request.post(`/api/tasks/${taskId}/attachments`, { multipart: {} });
  expect(empty.status()).toBe(400);

  const svg = await page.request.post(`/api/tasks/${taskId}/attachments`, {
    multipart: { file: { name: "../böse bild.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg onload=alert(1)></svg>") } },
  });
  expect(svg.status(), await svg.text()).toBe(201);
  const { id } = (await svg.json()) as { id: string };

  const inline = await page.request.get(`/api/attachments/${id}?inline=1`);
  expect(inline.status()).toBe(200);
  expect(inline.headers()["x-content-type-options"]).toBe("nosniff");
  expect(inline.headers()["content-disposition"]).toMatch(/^attachment; filename="b_se bild\.svg"/);
  expect(await inline.text()).toContain("<svg");

  const png = await page.request.post(`/api/tasks/${taskId}/attachments`, {
    multipart: { file: { name: "foto.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) } },
  });
  const pngId = ((await png.json()) as { id: string }).id;
  const pngInline = await page.request.get(`/api/attachments/${pngId}?inline=1`);
  expect(pngInline.headers()["content-disposition"]).toMatch(/^inline;/);
  expect(pngInline.headers()["content-type"]).toBe("image/png");

  expect((await page.request.get("/api/attachments/kaputt")).status()).toBe(404);

  const anonymous = await browser.newContext();
  const anon = await anonymous.request.get(`http://localhost:3100/api/attachments/${id}`);
  expect(anon.status()).toBe(401);
  const anonUpload = await anonymous.request.post(`http://localhost:3100/api/tasks/${taskId}/attachments`, {
    multipart: { file: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("x") } },
  });
  expect(anonUpload.status()).toBe(401);
  await anonymous.close();
  expect(board).toContain("/projects/");
});
