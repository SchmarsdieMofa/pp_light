"use client";

import { Popover } from "@base-ui/react/popover";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A small question mark that explains the word next to it. Opens on hover and keyboard focus (Enter/Space),
 * and on tap on touch screens – a plain tooltip would be out of reach there.
 * `topic` says what is explained (e.g. "Was ist eine Phase?"). The accessible name is the same "Erklärung" everywhere
 * on purpose: the button sits right behind the field label, and a name containing that label would make
 * `getByLabel("Status")` ambiguous between the field and its hint.
 */
export function InfoHint({ topic, children, className }: { topic: string; children: React.ReactNode; className?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={150}
        closeDelay={100}
        aria-label="Erklärung"
        data-hint={topic}
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:text-foreground",
          className,
        )}
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={6} className="isolate z-[60]">
          <Popover.Popup className="max-w-64 rounded-md bg-foreground px-3 py-2 text-xs leading-relaxed text-background shadow-md outline-none">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
