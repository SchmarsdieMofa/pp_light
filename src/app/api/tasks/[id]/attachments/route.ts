import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { errorResponse, jsonError } from "@/app/api/http-errors";
import { saveAttachment } from "@/server/attachments/service";
import { getActor } from "@/server/auth/session";
import { db } from "@/server/db/client";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return jsonError(401, "Bitte anmelden.");
  const { id } = await params;
  const env = getEnv();
  const maxBytes = env.UPLOAD_MAX_MB * 1024 * 1024;
  // Reject obviously oversized bodies before reading them into memory (multipart adds a little overhead).
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes + 64 * 1024) {
    return jsonError(413, `Die Datei ist zu groß (höchstens ${env.UPLOAD_MAX_MB} MB).`);
  }
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return jsonError(400, "Keine Datei übermittelt.");
  }
  if (!(file instanceof File)) return jsonError(400, "Keine Datei übermittelt.");
  try {
    const attachment = await saveAttachment(
      db(),
      actor,
      id,
      { name: file.name, type: file.type, data: new Uint8Array(await file.arrayBuffer()) },
      { uploadDir: env.UPLOAD_DIR, maxBytes },
    );
    revalidatePath("/", "layout");
    return NextResponse.json({ id: attachment.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
