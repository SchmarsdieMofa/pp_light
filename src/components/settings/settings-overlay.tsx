"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminUsers, type UserRow } from "@/components/admin/admin-users";
import { DensityToggle } from "@/components/board/density-toggle";
import { ThemeToggle } from "@/components/shell/user-menu";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CardDensity } from "@/lib/enums";
import { isTypingTarget } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { PasswordForm, ProfileForm } from "./account-settings";
import { SETTINGS_PARAM, useSettingsHref } from "./use-settings-href";

export type SettingsData = {
  name: string;
  email: string;
  ownId: string;
  hasPassword: boolean;
  cardDensity: CardDensity;
  /** Only for admins. */
  users: UserRow[] | null;
};

function Block(props: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-label={props.title} className="space-y-3 py-5 first:pt-0 last:pb-0">
      <div>
        <h3 className="text-sm font-semibold">{props.title}</h3>
        {props.description && <p className="mt-0.5 text-sm text-muted-foreground">{props.description}</p>}
      </div>
      {props.children}
    </section>
  );
}

/**
 * Settings as a modal overlay above the current view. The open tab lives in `?settings=`, so links,
 * reloads and the back button work; closing drops the parameter.
 */
export function SettingsOverlay({ data }: { data: SettingsData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hrefFor = useSettingsHref();
  const requested = searchParams.get(SETTINGS_PARAM);
  const tab = requested === "nutzer" && data.users ? "nutzer" : requested ? "konto" : null;
  if (!tab) return null;

  function close() {
    // Blur first: fields save on blur, and an unmounted input never fires it.
    (document.activeElement as HTMLElement | null)?.blur();
    router.push(hrefFor(null), { scroll: false });
  }

  const tabs = [
    { value: "konto" as const, label: "Mein Konto" },
    ...(data.users ? [{ value: "nutzer" as const, label: "Nutzerverwaltung" }] : []),
  ];

  return (
    <Dialog.Root
      open
      onOpenChange={(open, details) => {
        if (open) return;
        if (details.reason === "escape-key") {
          const event = details.event as KeyboardEvent;
          event.preventDefault();
          const active = document.activeElement as HTMLElement | null;
          // A focused field is left first (and saves); a second Esc closes.
          if (isTypingTarget(active)) {
            details.cancel();
            active?.blur();
            return;
          }
        }
        close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 supports-backdrop-filter:backdrop-blur-[2px]" />
        <Dialog.Popup
          aria-label="Einstellungen"
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background outline-none md:inset-x-0 md:top-[6svh] md:bottom-auto md:mx-auto md:max-h-[88svh] md:w-[min(44rem,calc(100%-3rem))] md:rounded-xl md:border md:shadow-2xl"
        >
          <header className="flex items-center gap-2 border-b px-5 pt-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold">Einstellungen</Dialog.Title>
              {tabs.length > 1 ? (
                <nav aria-label="Einstellungsbereiche" className="mt-2 flex gap-1">
                  {tabs.map((t) => (
                    <Link
                      key={t.value}
                      href={hrefFor(t.value)}
                      replace
                      scroll={false}
                      aria-current={tab === t.value ? "page" : undefined}
                      className={cn(
                        "-mb-px border-b-2 border-transparent px-2 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
                        tab === t.value && "border-foreground font-medium text-foreground",
                      )}
                    >
                      {t.label}
                    </Link>
                  ))}
                </nav>
              ) : (
                <div className="h-3" />
              )}
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Schließen" className="self-start" onClick={close}>
              <X />
            </Button>
          </header>

          <ScrollArea className="flex-1" contentClassName="divide-y px-5 py-5" scrollFade>
            {tab === "konto" ? (
              <>
                <Block title="Profil" description="So sehen dich andere in Projekten, Kommentaren und Zuweisungen.">
                  <ProfileForm name={data.name} email={data.email} />
                </Block>
                <Block title="Darstellung" description="Gilt für dein Konto auf allen Geräten.">
                  <div className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr] sm:items-center">
                    <span className="text-muted-foreground">Farbschema</span>
                    <ThemeToggle withLabels />
                    <span className="text-muted-foreground">Board-Karten</span>
                    <DensityToggle density={data.cardDensity} />
                  </div>
                </Block>
                <Block title="Passwort">
                  {data.hasPassword ? (
                    <PasswordForm />
                  ) : (
                    <p className="text-sm text-muted-foreground">Du meldest dich über Single Sign-on an – das Passwort verwaltest du dort.</p>
                  )}
                </Block>
              </>
            ) : (
              <Block title="Nutzerverwaltung" description="Personen einladen, Rollen vergeben und Konten deaktivieren.">
                <AdminUsers users={data.users!} ownId={data.ownId} />
              </Block>
            )}
          </ScrollArea>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
