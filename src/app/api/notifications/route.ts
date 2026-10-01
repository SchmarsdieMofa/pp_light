import { getActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { unreadCount } from "@/server/notifications/service";

export async function GET() {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
  return Response.json({ unread: await unreadCount(db(), actor) }, { headers: { "Cache-Control": "no-store" } });
}
