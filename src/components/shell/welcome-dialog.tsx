"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Bell, CalendarDays, FolderKanban, Home, Search, Sparkles, Users, X, type LucideIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { markOnboardedAction } from "@/app/(app)/actions";
import { NEW_PROJECT_EVENT } from "@/components/projects/new-project-dialog";
import { Button } from "@/components/ui/button";
import { buildHref, normalizeSearchParams } from "@/lib/urls";
import { cn } from "@/lib/utils";

export const WELCOME_PARAM = "welcome";

/** `action`: an extra button that closes the tour and opens that place. */
type Step = { icon: LucideIcon; title: string; text: React.ReactNode; action?: { label: string; settings: string } };

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs text-foreground">{children}</kbd>
);

function steps(firstName: string, isAdmin: boolean): Step[] {
  return [
    {
      icon: Sparkles,
      title: `Willkommen${firstName ? `, ${firstName}` : ""}!`,
      text: "pp_light ist euer Projektplaner: Aufgaben stehen im Mittelpunkt, Board, Gantt und Kalender sind Sichten darauf. Ein kurzer Rundgang – dauert keine Minute.",
    },
    {
      icon: Home,
      title: "Meine Arbeit",
      text: (
        <>
          Die Startseite zeigt deine Aufgaben nach Fälligkeit. Mit einem Klick abhaken, auf heute oder morgen schieben – und mit{" "}
          <Kbd>C</Kbd> schnell eine neue Aufgabe für dich erfassen.
        </>
      ),
    },
    {
      icon: FolderKanban,
      title: "Projekte: Board, Gantt, Liste",
      text: (
        <>
          Jedes Projekt hat drei Sichten auf dieselben Aufgaben, umschalten mit <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd>. Ein Klick auf
          eine Aufgabe öffnet sie direkt über der Ansicht; <Kbd>Esc</Kbd> schließt sie wieder.
        </>
      ),
    },
    {
      icon: CalendarDays,
      title: "Kalender",
      text: "Alle Fälligkeiten aus deinen Projekten als Monat, Woche oder Liste. Einen Termin verschiebst du, indem du ihn auf einen anderen Tag ziehst.",
    },
    {
      icon: Search,
      title: "Suche und Tastenkürzel",
      text: (
        <>
          <Kbd>Strg</Kbd> + <Kbd>K</Kbd> (Mac: <Kbd>⌘</Kbd> + <Kbd>K</Kbd>) findet Aufgaben und Projekte von überall. <Kbd>?</Kbd> zeigt
          alle Tastenkürzel – dort kannst du auch diese Einführung wieder öffnen.
        </>
      ),
    },
    {
      icon: Bell,
      title: "Benachrichtigungen",
      text: "Wirst du erwähnt oder bekommst eine Aufgabe, landet das in der Inbox. Was du nicht gleich liest, kommt gesammelt per E-Mail.",
    },
    ...(isAdmin
      ? [
          {
            icon: Users,
            title: "Dein Team",
            text: "Als Admin lädst du Kolleginnen und Kollegen über das Zahnrad unten links ein: Einstellungen → Nutzerverwaltung. Dort findest du auch Backups und Server-Einstellungen.",
            action: { label: "Nutzerverwaltung öffnen", settings: "nutzer" },
          },
        ]
      : []),
  ];
}

/**
 * Short welcome tour. Opens by itself once per user (until finished or skipped) and again via `?welcome=1`.
 * It waits while the settings or a task overlay is open – e.g. right after the first-run setup.
 */
export function WelcomeDialog(props: { name: string; isAdmin: boolean; onboarded: boolean; hasProjects: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(props.onboarded);
  const [index, setIndex] = useState(0);
  const all = steps(props.name.trim().split(/\s+/)[0] ?? "", props.isAdmin);
  const requested = searchParams.get(WELCOME_PARAM) === "1";
  const open = requested || (!dismissed && !searchParams.get("settings") && !searchParams.get("task"));
  if (!open) return null;

  const step = all[index];
  const last = index === all.length - 1;

  const href = (params: Record<string, string | null>) =>
    buildHref(pathname, normalizeSearchParams(Object.fromEntries(searchParams.entries())), { [WELCOME_PARAM]: null, ...params });

  function close(then?: () => void) {
    if (!dismissed) {
      setDismissed(true);
      void markOnboardedAction();
    }
    setIndex(0);
    if (requested) router.replace(href({}), { scroll: false });
    then?.();
  }

  return (
    <Dialog.Root open onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 supports-backdrop-filter:backdrop-blur-[2px]" />
        <Dialog.Popup
          aria-label="Einführung"
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92svh] flex-col rounded-t-2xl border bg-background p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6 shadow-2xl outline-none sm:inset-x-auto sm:bottom-auto sm:top-[22svh] sm:left-1/2 sm:w-[min(28rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:rounded-xl"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" && !last) setIndex(index + 1);
            else if (event.key === "ArrowLeft" && index > 0) setIndex(index - 1);
            else return;
            event.preventDefault();
          }}
        >
          <Dialog.Close
            render={<Button variant="ghost" size="icon-sm" aria-label="Schließen" className="absolute top-3 right-3" />}
          >
            <X />
          </Dialog.Close>

          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <step.icon className="size-6" aria-hidden />
          </div>
          <Dialog.Title className="mt-4 text-lg font-semibold">{step.title}</Dialog.Title>
          <Dialog.Description render={<div />} className="mt-2 min-h-[4.5rem] text-sm leading-relaxed text-muted-foreground">
            {step.text}
          </Dialog.Description>

          {step.action && (
            <Button
              variant="link"
              className="mt-1 h-auto self-start p-0"
              onClick={() => close(() => router.push(href({ settings: step.action!.settings }), { scroll: false }))}
            >
              {step.action.label}
            </Button>
          )}

          <div className="mt-5 flex items-center gap-1.5" aria-label={`Schritt ${index + 1} von ${all.length}`} role="img">
            {all.map((s, i) => (
              <span
                key={s.title}
                className={cn("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-foreground" : "w-1.5 bg-muted-foreground/30")}
              />
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {!last && (
              <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => close()}>
                Überspringen
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              {index > 0 && (
                <Button variant="outline" onClick={() => setIndex(index - 1)}>
                  Zurück
                </Button>
              )}
              {!last ? (
                <Button onClick={() => setIndex(index + 1)} autoFocus>
                  Weiter
                </Button>
              ) : props.hasProjects ? (
                <Button onClick={() => close()} autoFocus>
                  Los geht’s
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => close()}>
                    Später
                  </Button>
                  <Button onClick={() => close(() => window.dispatchEvent(new Event(NEW_PROJECT_EVENT)))} autoFocus>
                    Erstes Projekt anlegen
                  </Button>
                </>
              )}
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
