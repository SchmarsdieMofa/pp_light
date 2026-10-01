"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { buildHref, normalizeSearchParams } from "@/lib/urls";

/** Link to a task: on the task page → its own page, elsewhere → same view with the panel open. */
export function useTaskHref(): (taskId: string) => string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (taskId) => {
    if (pathname.startsWith("/tasks/")) return `/tasks/${taskId}`;
    return buildHref(pathname, normalizeSearchParams(Object.fromEntries(searchParams.entries())), { task: taskId });
  };
}
