"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { saveCardDensityAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import type { CardDensity } from "@/lib/enums";

const OPTIONS: { value: CardDensity; label: string }[] = [
  { value: "compact", label: "Kompakt" },
  { value: "medium", label: "Mittel" },
  { value: "full", label: "Ausführlich" },
];

export function DensityToggle({ density }: { density: CardDensity }) {
  const [current, setCurrent] = useOptimistic(density);
  const [, startTransition] = useTransition();
  return (
    <div role="group" aria-label="Kartendichte" className="flex gap-1">
      {OPTIONS.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={current === o.value ? "secondary" : "ghost"}
          aria-pressed={current === o.value}
          onClick={() =>
            startTransition(async () => {
              setCurrent(o.value);
              const res = await saveCardDensityAction(o.value);
              if (!res.ok) toast.error(res.error.message);
            })
          }
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
