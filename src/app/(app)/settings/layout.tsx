import { SettingsTabs } from "@/components/settings/settings-tabs";
import { requireActor } from "@/server/auth/session";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4 pb-10 sm:p-6">
      <h1 className="text-xl font-semibold">Einstellungen</h1>
      <SettingsTabs isAdmin={actor.role === "admin"} />
      {children}
    </div>
  );
}
