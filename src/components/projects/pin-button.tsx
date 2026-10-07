"use client";

import { Pin } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { setProjectPinnedAction } from "@/app/(app)/projects/actions";
import { cn } from "@/lib/utils";

/** Pins a project to the top of the sidebar. Flips at once; the sidebar follows when the server answered. */
export function PinButton({ projectId, projectName, pinned, className }: { projectId: string; projectName: string; pinned: boolean; className?: string }) {
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(pinned, (_current, next: boolean) => next);
  return (
    <button
      type="button"
      aria-pressed={shown}
      aria-label={shown ? `${projectName} nicht mehr anpinnen` : `${projectName} anpinnen`}
      title={shown ? "Nicht mehr anpinnen" : "Anpinnen für den Schnellzugriff"}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        shown && "text-foreground",
        className,
      )}
      onClick={() => {
        const next = !shown;
        startTransition(async () => {
          setShown(next);
          const res = await setProjectPinnedAction(projectId, next);
          if (!res.ok) toast.error(res.error.message);
        });
      }}
    >
      <Pin className={cn("size-3.5", shown && "fill-current")} aria-hidden />
    </button>
  );
}
