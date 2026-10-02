import { Suspense } from "react";
import { SettingsOverlay } from "@/components/settings/settings-overlay";
import { AppShell } from "@/components/shell/app-shell";
import { CommandCenter } from "@/components/shell/command-center";
import { Sidebar } from "@/components/shell/sidebar";
import { ThemeSync } from "@/components/shell/theme-sync";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getPreferences } from "@/server/preferences/service";
import { listProjectsForUser } from "@/server/projects/service";
import { unreadCount } from "@/server/notifications/service";
import { hasPassword } from "@/server/users/account";
import { listUsers } from "@/server/users/invitations";
import { listBackupRuns } from "@/server/backups/service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const isAdmin = actor.role === "admin";
  const [projects, prefs, initialUnread, withPassword, users, backups] = await Promise.all([
    listProjectsForUser(db(), actor),
    getPreferences(db(), actor.id),
    unreadCount(db(), actor),
    hasPassword(db(), actor),
    isAdmin ? listUsers(db(), actor) : null,
    isAdmin ? listBackupRuns(db(), actor) : null,
  ]);
  return (
    <>
      <ThemeSync theme={prefs.theme} />
      <AppShell
        sidebar={
          <Sidebar
            user={{ name: actor.name, email: actor.email }}
            projects={projects.map((p) => ({ id: p.id, name: p.name, key: p.key }))}
            initialUnread={initialUnread}
          />
        }
      >
        {children}
      </AppShell>
      <Suspense>
        <SettingsOverlay
          data={{ name: actor.name, email: actor.email, ownId: actor.id, hasPassword: withPassword, cardDensity: prefs.cardDensity, users, backups }}
        />
      </Suspense>
      <CommandCenter projects={projects.map((p) => ({ id: p.id, name: p.name, key: p.key }))} />
    </>
  );
}
