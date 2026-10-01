"use client";

import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { buildHref, normalizeSearchParams } from "@/lib/urls";

export function PanelHeader({ taskId }: { taskId?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const closeHref = buildHref(pathname, normalizeSearchParams(Object.fromEntries(searchParams.entries())), { task: null });
  return (
    <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
      {taskId && (
        <Link href={`/tasks/${taskId}`} className="inline-flex items-center gap-1 hover:text-foreground">
          <ExternalLink className="size-3" /> Als Seite öffnen
        </Link>
      )}
      <Link href={closeHref} className="inline-flex items-center gap-1 hover:text-foreground">
        <X className="size-3" /> Schließen
      </Link>
    </div>
  );
}
