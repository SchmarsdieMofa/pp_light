import { NextResponse, type NextRequest } from "next/server";
import { httpsRedirect, requestOrigin } from "@/lib/access-redirect";
import { db } from "@/server/db/client";
import { getAppSettings } from "@/server/settings/service";
import { hasUsers } from "@/server/setup/service";

type State = { setupDone: boolean; httpsOnly: boolean };
let cached: { state: State; at: number } | undefined;

/** Read at most every 5 s; a finished setup never becomes undone, so that part is not read again. */
async function state(): Promise<State> {
  if (cached && Date.now() - cached.at < 5_000) return cached.state;
  const [setupDone, settings] = await Promise.all([
    cached?.state.setupDone || hasUsers(db()),
    getAppSettings(db()),
  ]);
  cached = { state: { setupDone, httpsOnly: settings.httpsOnly }, at: Date.now() };
  return cached.state;
}

/** HTTP→HTTPS redirect when an admin chose „Nur HTTPS“, and the way to /setup on a fresh install. */
export async function proxy(request: NextRequest) {
  let current: State;
  try {
    current = await state();
  } catch {
    return NextResponse.next(); // Database unreachable: the pages report that themselves.
  }
  const target = httpsRedirect(current.httpsOnly, request.headers, request.url);
  if (target) return NextResponse.redirect(target, 308);
  const { pathname } = request.nextUrl;
  if (!current.setupDone && pathname !== "/setup" && !pathname.startsWith("/api/")) {
    // Built from the forwarded scheme and host: the URL the app sees is the container's own address.
    return NextResponse.redirect(`${requestOrigin(request.headers, request.url)}/setup`);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
