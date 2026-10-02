import { redirect } from "next/navigation";
import { AdminUsers } from "@/components/admin/admin-users";
import { SettingsSection } from "@/components/projects/settings-ui";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listUsers } from "@/server/users/invitations";

export default async function UsersSettingsPage() {
  const actor = await requireActor();
  if (actor.role !== "admin") redirect("/settings");
  return (
    <SettingsSection id="nutzer" title="Nutzerverwaltung" description="Personen einladen, Rollen vergeben und Konten deaktivieren.">
      <AdminUsers users={await listUsers(db(), actor)} ownId={actor.id} />
    </SettingsSection>
  );
}
