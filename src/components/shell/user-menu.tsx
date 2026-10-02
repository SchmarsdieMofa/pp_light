"use client";

import { LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { logoutAction, saveThemeAction } from "@/app/(app)/actions";
import { useSettingsHref } from "@/components/settings/use-settings-href";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Theme } from "@/lib/enums";

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Hell", Icon: Sun },
  { value: "dark", label: "Dunkel", Icon: Moon },
];

const noopSubscribe = () => () => {};

/** System / light / dark. `withLabels` shows the names next to the icons (settings page). */
export function ThemeToggle({ withLabels = false }: { withLabels?: boolean }) {
  const { theme, setTheme } = useTheme();
  // false during SSR/hydration, true afterwards – avoids a theme mismatch in aria-pressed
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const current = mounted ? theme : undefined;
  return (
    <div role="group" aria-label={withLabels ? "Farbschema" : "Darstellung"} className="flex gap-1">
      {THEME_OPTIONS.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          size={withLabels ? "sm" : "icon"}
          variant={current === value ? "secondary" : "ghost"}
          aria-label={withLabels ? undefined : label}
          aria-pressed={current === value}
          onClick={() => {
            setTheme(value);
            void saveThemeAction(value);
          }}
        >
          <Icon className="size-4" />
          {withLabels && label}
        </Button>
      ))}
    </div>
  );
}

export function UserMenu({ user }: { user: { name: string; email: string } }) {
  const settingsHref = useSettingsHref();
  return (
    <div className="space-y-2">
      <div className="px-2 text-sm">
        <div className="truncate font-medium">{user.name}</div>
        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
      </div>
      <div className="flex items-center justify-between px-1">
        <ThemeToggle />
        <Link href={settingsHref("konto")} scroll={false} aria-label="Einstellungen" title="Einstellungen" className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <Settings className="size-4" />
        </Link>
      </div>
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2">
          <LogOut className="size-4" /> Abmelden
        </Button>
      </form>
    </div>
  );
}
