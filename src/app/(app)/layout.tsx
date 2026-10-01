import { Sidebar } from "@/components/shell/sidebar";
import { ThemeSync } from "@/components/shell/theme-sync";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getPreferences } from "@/server/preferences/service";
import { listProjectsForUser } from "@/server/projects/service";
import { unreadCount } from "@/server/notifications/service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const [projects, prefs, initialUnread] = await Promise.all([
    listProjectsForUser(db(), actor),
    getPreferences(db(), actor.id),
    unreadCount(db(), actor),
  ]);
  return (
    <div className="flex min-h-svh">
      <ThemeSync theme={prefs.theme} />
      <Sidebar
        user={{ name: actor.name, email: actor.email }}
        projects={projects.map((p) => ({ id: p.id, name: p.name, key: p.key }))}
        initialUnread={initialUnread}
        isAdmin={actor.role === "admin"}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
