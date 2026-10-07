import { headers } from "next/headers";
import { Suspense } from "react";
import { SettingsOverlay } from "@/components/settings/settings-overlay";
import { AppShell } from "@/components/shell/app-shell";
import { CommandCenter } from "@/components/shell/command-center";
import { Sidebar } from "@/components/shell/sidebar";
import { ThemeSync } from "@/components/shell/theme-sync";
import { WelcomeDialog } from "@/components/shell/welcome-dialog";
import { requireActor } from "@/server/auth/session";
import { can } from "@/server/permissions";
import { db } from "@/server/db/client";
import { getPreferences } from "@/server/preferences/service";
import { listPinnedProjectIds } from "@/server/projects/pins";
import { listProjectsForUser } from "@/server/projects/service";
import { unreadCount } from "@/server/notifications/service";
import { hasPassword } from "@/server/users/account";
import { listUsers } from "@/server/users/invitations";
import { listGroups } from "@/server/groups/service";
import { listBackupRuns } from "@/server/backups/service";
import { requestOrigin, requestProto } from "@/lib/access-redirect";
import { getAppSettings, getBaseUrl } from "@/server/settings/service";

async function serverSettings() {
  const h = await headers();
  const [settings, baseUrl] = await Promise.all([getAppSettings(db()), getBaseUrl(db())]);
  const host = new URL(requestOrigin(h, "http://localhost")).hostname;
  return { httpsOnly: settings.httpsOnly, baseUrl, currentProto: requestProto(h, "http:"), httpsHref: `https://${host}/?settings=server` };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  // Admins run the system (backups, server, roles); managers only the people (users, groups).
  const isAdmin = can(actor, "system.manage");
  const managesPeople = can(actor, "users.manage");
  const [projects, pinnedIds, prefs, initialUnread, withPassword, users, groups, backups, server] = await Promise.all([
    listProjectsForUser(db(), actor),
    listPinnedProjectIds(db(), actor.id),
    getPreferences(db(), actor.id),
    unreadCount(db(), actor),
    hasPassword(db(), actor),
    managesPeople ? listUsers(db(), actor) : null,
    can(actor, "groups.manage") ? listGroups(db(), actor) : null,
    isAdmin ? listBackupRuns(db(), actor) : null,
    isAdmin ? serverSettings() : null,
  ]);
  const pinned = new Set(pinnedIds);
  return (
    <>
      <ThemeSync theme={prefs.theme} />
      <AppShell
        sidebar={
          <Sidebar
            user={{ name: actor.name, email: actor.email }}
            projects={projects.map((p) => ({ id: p.id, name: p.name, key: p.key, pinned: pinned.has(p.id) }))}
            initialUnread={initialUnread}
          />
        }
      >
        {children}
      </AppShell>
      <Suspense>
        <SettingsOverlay
          data={{ name: actor.name, email: actor.email, ownId: actor.id, ownRole: actor.role, hasPassword: withPassword, cardDensity: prefs.cardDensity, users, groups, backups, server }}
        />
      </Suspense>
      <CommandCenter projects={projects.map((p) => ({ id: p.id, name: p.name, key: p.key }))} />
      <Suspense>
        <WelcomeDialog name={actor.name} role={actor.role} onboarded={prefs.onboarded} hasProjects={projects.length > 0} />
      </Suspense>
    </>
  );
}
