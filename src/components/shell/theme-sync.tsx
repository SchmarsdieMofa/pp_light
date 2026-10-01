"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";
import type { Theme } from "@/lib/enums";

/** Applies the theme stored for the user (e.g. chosen on another device). */
export function ThemeSync({ theme }: { theme: Theme }) {
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);
  return null;
}
