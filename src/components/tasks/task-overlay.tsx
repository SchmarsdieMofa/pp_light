"use client";

import { Dialog } from "@base-ui/react/dialog";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isTypingTarget } from "@/lib/shortcuts";
import { buildHref, normalizeSearchParams } from "@/lib/urls";

/**
 * Task details as a modal overlay above the current view. The open task lives in `?task=`, so links,
 * reloads and the back button keep working; closing just drops the parameter.
 * Esc while typing only leaves the field (saving it) – a second Esc closes the overlay.
 */
export function TaskOverlay({ label, children, param = "task" }: { label: string; children: React.ReactNode; /** The search parameter holding the open item; closing drops it. */ param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function close() {
    // Blur first: fields save on blur, and an unmounted input never fires it.
    (document.activeElement as HTMLElement | null)?.blur();
    router.push(buildHref(pathname, normalizeSearchParams(Object.fromEntries(searchParams.entries())), { [param]: null }), {
      scroll: false,
    });
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open, details) => {
        if (open) return;
        if (details.reason === "escape-key") {
          const event = details.event as KeyboardEvent;
          const handledInside = event.defaultPrevented;
          // Keeps the global Esc shortcut from navigating a second time.
          event.preventDefault();
          const active = document.activeElement as HTMLElement | null;
          // A dropdown or mention list inside already used this Esc; a focused field is left first.
          if (handledInside) return details.cancel();
          if (isTypingTarget(active)) {
            details.cancel();
            active?.blur();
            return;
          }
        }
        close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 supports-backdrop-filter:backdrop-blur-[2px]" />
        <Dialog.Popup
          aria-label={label}
          data-task-overlay
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background outline-none md:inset-x-0 md:top-[4svh] md:bottom-auto md:mx-auto md:max-h-[92svh] md:w-[min(64rem,calc(100%-3rem))] md:rounded-xl md:border md:shadow-2xl"
        >
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
