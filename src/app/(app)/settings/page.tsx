import { DensityToggle } from "@/components/board/density-toggle";
import { SettingsSection } from "@/components/projects/settings-ui";
import { PasswordForm, ProfileForm } from "@/components/settings/account-settings";
import { ThemeToggle } from "@/components/shell/user-menu";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getPreferences } from "@/server/preferences/service";
import { hasPassword } from "@/server/users/account";

export default async function AccountSettingsPage() {
  const actor = await requireActor();
  const [prefs, withPassword] = await Promise.all([getPreferences(db(), actor.id), hasPassword(db(), actor)]);
  return (
    <>
      <SettingsSection id="profil" title="Profil" description="So sehen dich andere in Projekten, Kommentaren und Zuweisungen.">
        <ProfileForm name={actor.name} email={actor.email} />
      </SettingsSection>

      <SettingsSection id="passwort" title="Passwort">
        {withPassword ? (
          <PasswordForm />
        ) : (
          <p className="text-sm text-muted-foreground">Du meldest dich über Single Sign-on an – das Passwort verwaltest du dort.</p>
        )}
      </SettingsSection>

      <SettingsSection id="darstellung" title="Darstellung" description="Gilt für dein Konto auf allen Geräten.">
        <div className="grid gap-4 text-sm sm:grid-cols-[8rem_1fr] sm:items-center">
          <span className="text-muted-foreground">Farbschema</span>
          <ThemeToggle withLabels />
          <span className="text-muted-foreground">Board-Karten</span>
          <DensityToggle density={prefs.cardDensity} />
        </div>
      </SettingsSection>
    </>
  );
}
