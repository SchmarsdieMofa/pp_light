"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { markAllReadAction, markReadAction } from "@/app/(app)/inbox/actions";
import { useSettingsHref } from "@/components/settings/use-settings-href";
import { Button, buttonVariants } from "@/components/ui/button";

export function InboxControls({ notificationId }: { notificationId?: string }) {
  const router = useRouter();
  const settingsHref = useSettingsHref();
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<{ ok: boolean }>) => {
    setBusy(true);
    try {
      const result = await action();
      if (result.ok) {
        window.dispatchEvent(new Event("notifications-changed"));
        router.refresh();
      }
    } finally { setBusy(false); }
  };

  if (notificationId) return (
    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => markReadAction(notificationId))}>
      Als gelesen markieren
    </Button>
  );

  return (
    <div className="flex min-w-0 flex-wrap justify-start gap-2 sm:justify-end">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(markAllReadAction)}>Alle als gelesen markieren</Button>
      <Link href={settingsHref("benachrichtigungen")} scroll={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
        E-Mail-Einstellungen
      </Link>
    </div>
  );
}
