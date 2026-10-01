"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownText } from "./markdown-text";

export function TaskDescription({ initial, canEdit, save }: {
  initial: string;
  canEdit: boolean;
  save: (description: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  async function commit() {
    if (value === saved) { setEditing(false); return; }
    setPending(true);
    const ok = await save(value);
    setPending(false);
    if (ok) { setSaved(value); setEditing(false); }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Beschreibung</h2>
        {canEdit && !editing && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Bearbeiten</Button>}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea aria-label="Beschreibung bearbeiten" rows={7} value={value} disabled={pending}
            onChange={(event) => setValue(event.target.value)} placeholder="Details, Links, Notizen…" />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => void commit()}>Speichern</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => { setValue(saved); setEditing(false); }}>Abbrechen</Button>
          </div>
        </div>
      ) : saved ? <MarkdownText text={saved} /> : <p className="text-sm text-muted-foreground">Keine Beschreibung.</p>}
    </section>
  );
}
