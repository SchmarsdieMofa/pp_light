import { redirect } from "next/navigation";
import { AdminUsers } from "@/components/admin/admin-users";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listUsers } from "@/server/users/invitations";

export default async function AdminPage() {
  const actor = await requireActor();
  if (actor.role !== "admin") redirect("/");
  return <div className="mx-auto max-w-4xl space-y-6 p-6">
    <h1 className="text-xl font-semibold">Nutzerverwaltung</h1>
    <AdminUsers users={await listUsers(db(), actor)} ownId={actor.id} />
  </div>;
}
