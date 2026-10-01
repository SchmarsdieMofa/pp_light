"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createLabelAction, deleteLabelAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LABEL_COLORS } from "@/lib/labels";

type LabelItem = { id: string; name: string; color: string };

export function LabelManager(props: { projectId: string; labels: LabelItem[]; canManage: boolean }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(LABEL_COLORS[5].value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const res = await createLabelAction({ projectId: props.projectId, name, color });
      if (!res.ok) {
        setError(res.error.fieldErrors?.name?.[0] ?? res.error.message);
        return;
      }
      setError(null);
      setName("");
    });
  }

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {props.labels.length === 0 && <li className="text-sm text-muted-foreground">Noch keine Labels.</li>}
        {props.labels.map((l) => (
          <li key={l.id} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-sm">
            <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
            {l.name}
            {props.canManage && (
              <button
                type="button"
                aria-label={`Label ${l.name} löschen`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() =>
                  startTransition(async () => {
                    const res = await deleteLabelAction(l.id);
                    if (!res.ok) toast.error(res.error.message);
                  })
                }
              >
                <X className="size-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {props.canManage && (
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="label-name">Label-Name</Label>
            <Input id="label-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="h-8 w-48" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="label-color">Farbe</Label>
            <select
              id="label-color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              {LABEL_COLORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Label hinzufügen
          </Button>
          {error && (
            <p role="alert" className="w-full text-xs text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
