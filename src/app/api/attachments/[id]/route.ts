import { readFile } from "node:fs/promises";
import { getEnv } from "@/lib/env";
import { errorResponse, jsonError } from "@/app/api/http-errors";
import { contentDisposition, getAttachmentForDownload, isInlineImage } from "@/server/attachments/service";
import { getActor } from "@/server/auth/session";
import { db } from "@/server/db/client";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return jsonError(401, "Bitte anmelden.");
  const { id } = await params;
  try {
    const { attachment, path } = await getAttachmentForDownload(db(), actor, id, getEnv().UPLOAD_DIR);
    let data: Buffer;
    try {
      data = await readFile(path);
    } catch {
      return jsonError(404, "Anhang nicht gefunden.");
    }
    const inline = new URL(request.url).searchParams.get("inline") === "1" && isInlineImage(attachment.mime);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": inline ? attachment.mime : "application/octet-stream",
        "Content-Length": String(data.byteLength),
        "Content-Disposition": contentDisposition(attachment.filename, inline),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
