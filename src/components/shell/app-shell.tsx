"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Desktop: sidebar next to the content. Below `md`: a top bar with a menu button that opens the sidebar as a drawer. */
export function AppShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  // The drawer belongs to the page it was opened on: any navigation (link, dialog, shortcut) closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b bg-background px-3 py-2 md:hidden">
        <Button type="button" size="icon" variant="ghost" aria-label="Menü öffnen" aria-expanded={open} onClick={() => setOpen(true)}>
          <Menu className="size-5" />
        </Button>
        <span className="text-sm font-semibold">pp_light</span>
      </header>
      <div className={cn(open ? "fixed inset-0 z-40 flex" : "hidden", "md:static md:z-auto md:flex")}>
        <div
          className="flex h-full min-h-0 overflow-y-auto overscroll-contain bg-background md:h-auto md:overflow-visible"
          // Close the drawer as soon as a navigation link inside it is used.
          onClickCapture={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {sidebar}
        </div>
        {open && (
          <button type="button" aria-label="Menü schließen" className="flex-1 bg-black/40 md:hidden" onClick={() => setOpen(false)}>
            <X className="absolute top-3 right-3 size-5 text-white" aria-hidden />
          </button>
        )}
      </div>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
