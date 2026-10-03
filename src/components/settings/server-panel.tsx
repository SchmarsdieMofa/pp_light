"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setBaseUrlAction, setHttpsOnlyAction } from "@/app/(app)/settings/actions";
import { AutosaveInput, useRunner } from "@/components/projects/settings-ui";
import { cn } from "@/lib/utils";

export type ServerSettings = {
  httpsOnly: boolean;
  /** Address in mail links, as stored or the fallback. */
  baseUrl: string;
  /** Scheme of the connection the admin is using right now. */
  currentProto: "http" | "https";
  /** This page over HTTPS – where „Nur HTTPS“ can be switched on. */
  httpsHref: string;
};

const MODES = [
  {
    httpsOnly: false,
    label: "HTTP und HTTPS",
    description: "Beides funktioniert. Richtig, wenn ein vorhandener Proxy davor HTTPS übernimmt.",
  },
  {
    httpsOnly: true,
    label: "Nur HTTPS",
    description: "Aufrufe über HTTP werden auf HTTPS umgeleitet. Anmeldedaten gehen nie unverschlüsselt durchs Netz.",
  },
] as const;

/** Instance settings for admins: address for mail links and whether plain HTTP is allowed. */
export function ServerPanel({ settings }: { settings: ServerSettings }) {
  const router = useRouter();
  const { pending, run } = useRunner();
  const overHttp = settings.currentProto === "http";

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <label htmlFor="base-url" className="text-sm font-medium">
          Adresse
        </label>
        <div className="-mx-2">
          <AutosaveInput id="base-url" label="Adresse" value={settings.baseUrl} required maxLength={200} onSave={setBaseUrlAction} />
        </div>
        <p className="text-xs text-muted-foreground">Steht in Links in E-Mails: Einladungen, Passwort-Reset, Benachrichtigungen.</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Zugriff</legend>
        {MODES.map((mode) => {
          const selected = settings.httpsOnly === mode.httpsOnly;
          const blocked = mode.httpsOnly && overHttp && !selected;
          return (
            <label
              key={mode.label}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50",
                selected && "border-foreground/40 bg-accent/40",
                (blocked || pending) && "cursor-not-allowed opacity-60 hover:bg-transparent",
              )}
            >
              <input
                type="radio"
                name="access-mode"
                className="mt-1 accent-foreground"
                checked={selected}
                disabled={blocked || pending}
                onChange={() =>
                  run(
                    () => setHttpsOnlyAction(mode.httpsOnly),
                    () => {
                      toast.success(mode.httpsOnly ? "Nur noch HTTPS" : "HTTP ist wieder erlaubt");
                      router.refresh();
                    },
                  )
                }
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{mode.label}</span>
                <span className="block text-sm text-muted-foreground">{mode.description}</span>
              </span>
            </label>
          );
        })}
        {overHttp && !settings.httpsOnly && (
          <p className="text-xs text-muted-foreground">
            Du bist gerade über HTTP verbunden. „Nur HTTPS“ lässt sich nur über HTTPS einschalten – so ist sicher, dass HTTPS
            bis zu pp_light durchkommt.{" "}
            <a href={settings.httpsHref} className="underline">
              Über HTTPS öffnen
            </a>
            . Geht das nicht, weil ein Proxy davor HTTPS übernimmt, bleibt es bei „HTTP und HTTPS“.
          </p>
        )}
      </fieldset>
    </div>
  );
}
