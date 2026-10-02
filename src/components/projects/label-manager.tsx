"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { createLabelAction, deleteLabelAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { LABEL_COLORS } from "@/lib/labels";
import { ColorPicker, useRunner } from "./settings-ui";

type LabelItem = { id: string; name: string; color: string };

export function LabelManager(props: { projectId: string; labels: LabelItem[]; canManage: boolean }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(LABEL_COLORS[props.labels.length % LABEL_COLORS.length].value);
  const { pending, run } = useRunner();

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {props.labels.length === 0 && <li className="text-sm text-muted-foreground">Noch keine Labels.</li>}
        {props.labels.map((l) => (
          <li key={l.id} className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-1 pl-2.5 text-sm">
            <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
            {l.name}
            {props.canManage && (
              <button
                type="button"
                aria-label={`Label ${l.name} löschen`}
                className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => run(() => deleteLabelAction(l.id))}
              >
                <X className="size-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {props.canManage && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            run(() => createLabelAction({ projectId: props.projectId, name, color }), () => {
              setName("");
              setColor(LABEL_COLORS[(props.labels.length + 1) % LABEL_COLORS.length].value);
            });
          }}
        >
          <ColorPicker value={color} label="Farbe des neuen Labels" onChange={setColor} />
          <input
            aria-label="Label-Name"
            placeholder="Neues Label, z. B. „Design“"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending || !name.trim()}>
            <Plus /> Label hinzufügen
          </Button>
        </form>
      )}
    </div>
  );
}
