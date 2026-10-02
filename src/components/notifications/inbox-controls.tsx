"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { markAllReadAction, markReadAction, saveNotificationPreferencesAction } from "@/app/(app)/inbox/actions";
import { Button } from "@/components/ui/button";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notification-types";

const labels: Record<NotificationType, string> = {
  assigned: "Zuweisung", mentioned: "Erwähnung", comment: "Kommentar", status: "Statuswechsel",
  schedule: "Terminänderung", dueSoon: "Bald fällig", overdue: "Überfällig",
};

export function InboxControls({ notificationId, disabled }: { notificationId?: string; disabled?: NotificationType[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selected, setSelected] = useState<NotificationType[]>(disabled ?? []);
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
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(markAllReadAction)}>Alle als gelesen markieren</Button>
      <Button type="button" size="sm" variant="outline" aria-expanded={showSettings} onClick={() => setShowSettings(!showSettings)}>E-Mail-Einstellungen</Button>
      {showSettings && <fieldset className="w-full space-y-2 rounded-md border p-4 text-sm">
        <legend className="font-medium">E-Mail für diese Ereignisse ausschalten</legend>
        {NOTIFICATION_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-2">
            <Checkbox checked={selected.includes(type)} onCheckedChange={(checked) => setSelected(checked ? [...selected, type] : selected.filter((value) => value !== type))} />
            {labels[type]}
          </label>
        ))}
        <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => saveNotificationPreferencesAction(selected))}>Speichern</Button>
      </fieldset>}
    </div>
  );
}
