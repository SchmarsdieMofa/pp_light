"use client";

import { Popover } from "@base-ui/react/popover";
import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LABEL_COLORS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/server/action-result";

/** One card on the settings page: title, a sentence on what it is for, then its content. */
export function SettingsSection(props: { id: string; title: string; description?: string; children: React.ReactNode; tone?: "danger" }) {
  return (
    <section
      id={props.id}
      aria-labelledby={`${props.id}-title`}
      className={cn("scroll-mt-6 rounded-xl border bg-card", props.tone === "danger" && "border-destructive/40")}
    >
      <header className="border-b px-5 py-4">
        <h2 id={`${props.id}-title`} className={cn("text-base font-semibold", props.tone === "danger" && "text-destructive")}>{props.title}</h2>
        {props.description && <p className="mt-0.5 text-sm text-muted-foreground">{props.description}</p>}
      </header>
      <div className="px-5 py-4">{props.children}</div>
    </section>
  );
}

/** Runs a server action; errors become a toast. `onOk` runs after success. */
export function useRunner() {
  const [pending, startTransition] = useTransition();
  function run<T>(action: () => Promise<ActionResult<T>>, onOk?: (data: T) => void, onError?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        onOk?.(res.data);
        return;
      }
      const fieldMessage = res.error.fieldErrors ? Object.values(res.error.fieldErrors).flat()[0] : undefined;
      toast.error(fieldMessage ?? res.error.message);
      onError?.();
    });
  }
  return { pending, run };
}

/**
 * Text that saves itself when you leave the field or press Enter – no save button. Empty input (when
 * `required`) or a failed save restores the last saved value.
 */
export function AutosaveInput(props: {
  value: string;
  label: string;
  onSave: (value: string) => Promise<ActionResult<void>>;
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
  className?: string;
  id?: string;
}) {
  const [text, setText] = useState(props.value);
  const [saved, setSaved] = useState(props.value);
  const { run } = useRunner();
  if (props.value !== saved && text === saved) {
    setSaved(props.value);
    setText(props.value);
  }
  function commit() {
    const next = text.trim();
    if (next === saved) return setText(saved);
    if (props.required && !next) return setText(saved);
    run(() => props.onSave(next), () => setSaved(next), () => setText(saved));
  }
  return (
    <input
      id={props.id}
      aria-label={props.id ? undefined : props.label}
      value={text}
      disabled={props.disabled}
      maxLength={props.maxLength}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setText(saved);
        }
      }}
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm transition-colors outline-none",
        "hover:border-input focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 disabled:hover:border-transparent",
        props.className,
      )}
    />
  );
}

/** A colored dot that opens a small palette. */
export function ColorPicker(props: { value: string; label: string; onChange: (color: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const known = LABEL_COLORS.find((c) => c.value === props.value);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={props.disabled}
        aria-label={`${props.label}: ${known?.name ?? "eigene Farbe"}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:pointer-events-none"
      >
        <span className="size-3.5 rounded-full ring-1 ring-foreground/10" style={{ backgroundColor: props.value }} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4} className="z-[60]">
          <Popover.Popup aria-label={props.label} className="grid grid-cols-4 gap-1 rounded-lg border bg-popover p-2 shadow-lg outline-none">
            {LABEL_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={c.name}
                aria-pressed={c.value === props.value}
                onClick={() => {
                  setOpen(false);
                  if (c.value !== props.value) props.onChange(c.value);
                }}
                className="flex size-8 items-center justify-center rounded-md hover:bg-muted"
              >
                <span className="flex size-5 items-center justify-center rounded-full text-white" style={{ backgroundColor: c.value }}>
                  {c.value === props.value && <Check className="size-3" />}
                </span>
              </button>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A button that asks before it does something hard to undo. */
export function ConfirmAction(props: {
  trigger: React.ReactNode;
  triggerLabel?: string;
  triggerVariant?: "ghost" | "outline" | "destructive";
  triggerSize?: "sm" | "icon-sm" | "default";
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  children?: React.ReactNode;
  confirmDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={props.triggerVariant ?? "ghost"}
        size={props.triggerSize ?? "icon-sm"}
        aria-label={props.triggerLabel}
        title={props.triggerLabel}
        onClick={() => setOpen(true)}
      >
        {props.trigger}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            <DialogDescription>{props.description}</DialogDescription>
          </DialogHeader>
          {props.children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={props.pending || props.confirmDisabled}
              onClick={() => {
                props.onConfirm();
                setOpen(false);
              }}
            >
              {props.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
