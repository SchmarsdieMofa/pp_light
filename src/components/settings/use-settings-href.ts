"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { buildHref, normalizeSearchParams } from "@/lib/urls";

export const SETTINGS_PARAM = "settings";
export type SettingsTab = "konto" | "nutzer" | "backups";

/** Href of the current view with the settings overlay open on `tab` (null closes it). */
export function useSettingsHref(): (tab: SettingsTab | null) => string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (tab) => buildHref(pathname, normalizeSearchParams(Object.fromEntries(searchParams.entries())), { [SETTINGS_PARAM]: tab });
}
