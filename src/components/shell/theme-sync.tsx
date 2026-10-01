"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import type { Theme } from "@/lib/enums";

/** Applies the theme stored for the user (e.g. chosen on another device). */
export function ThemeSync({ theme }: { theme: Theme }) {
  const { setTheme } = useTheme();
  // next-themes recreates setTheme whenever the theme changes; only re-apply when the *stored* value changes,
  // otherwise a click on another theme would immediately be reverted.
  const applied = useRef<Theme | null>(null);
  useEffect(() => {
    if (applied.current === theme) return;
    applied.current = theme;
    setTheme(theme);
  }, [theme, setTheme]);
  return null;
}
