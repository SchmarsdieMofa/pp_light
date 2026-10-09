"use client";

import { useState } from "react";
import { saveNotificationPreferencesAction } from "@/app/(app)/inbox/actions";
import { useRunner } from "@/components/projects/settings-ui";
import { Checkbox } from "@/components/ui/checkbox";
import { NOTIFICATION_LABELS, NOTIFICATION_TYPES, type NotificationType } from "@/lib/notification-types";

/** One switch per kind of event: checked = an e-mail is sent. Every change saves at once. */
export function NotificationSettings({ disabled }: { disabled: NotificationType[] }) {
  const [off, setOff] = useState<NotificationType[]>(disabled);
  const { run } = useRunner();

  function toggle(type: NotificationType, send: boolean) {
    const before = off;
    const next = send ? before.filter((t) => t !== type) : [...before, type];
    setOff(next);
    // Undo only this switch: other toggles made while the request was in flight stay as they are.
    run(
      () => saveNotificationPreferencesAction(next),
      undefined,
      () => setOff((current) => (send ? [...current, type] : current.filter((t) => t !== type))),
    );
  }

  return (
    <fieldset className="space-y-1 text-sm">
      <legend className="sr-only">E-Mail senden bei</legend>
      {NOTIFICATION_TYPES.map((type) => (
        <label key={type} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
          <Checkbox checked={!off.includes(type)} onCheckedChange={(checked) => toggle(type, checked)} />
          {NOTIFICATION_LABELS[type]}
        </label>
      ))}
    </fieldset>
  );
}
