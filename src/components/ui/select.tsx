"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string; description?: string; disabled?: boolean };

type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  /** Accessible name when there is no <label htmlFor={id}>. */
  "aria-label"?: string;
  id?: string;
  /** Submitted with forms. */
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
  /** Search field in the popup. Default: on for more than eight options. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
};

const triggerClass = (size: SelectProps["size"]) =>
  cn(
    "inline-flex w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-background text-left font-normal whitespace-nowrap outline-none transition-colors select-none",
    "hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted/60",
    "disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50",
    size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-sm",
  );

const popupClass =
  "max-h-[min(20rem,var(--available-height))] min-w-[var(--anchor-width)] max-w-[min(28rem,var(--available-width))] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none origin-[var(--transform-origin)] transition-[scale,opacity] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0";

const itemClass =
  "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50";

function ItemBody({ option }: { option: SelectOption }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate">{option.label}</span>
      {option.description && <span className="block truncate text-xs text-muted-foreground">{option.description}</span>}
    </span>
  );
}

/**
 * Dropdown in the app's style: an outline trigger, a list with a check on the chosen entry and – for longer
 * lists – a search field on top. Values are strings; "" is a normal value (e.g. "Alle", "Keine").
 */
export function Select(props: SelectProps) {
  const searchable = props.searchable ?? props.options.length > 8;
  return searchable ? <SearchSelect {...props} /> : <PlainSelect {...props} />;
}

function PlainSelect(props: SelectProps) {
  const items = useMemo(() => props.options.map(({ value, label }) => ({ value, label })), [props.options]);
  return (
    <SelectPrimitive.Root
      items={items}
      value={props.value}
      name={props.name}
      disabled={props.disabled}
      onValueChange={(value) => {
        if (typeof value === "string" && value !== props.value) props.onValueChange(value);
      }}
    >
      <SelectPrimitive.Trigger id={props.id} aria-label={props["aria-label"]} className={cn(triggerClass(props.size), props.className)}>
        <SelectPrimitive.Value className="truncate data-placeholder:text-muted-foreground" placeholder={props.placeholder} />
        <SelectPrimitive.Icon className="shrink-0 opacity-50">
          <ChevronsUpDown className="size-3.5" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner className="z-[60] outline-none" sideOffset={4} alignItemWithTrigger={false} align="start">
          <SelectPrimitive.Popup className={popupClass}>
            <SelectPrimitive.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto overscroll-contain p-1 scroll-py-1">
              {props.options.map((option) => (
                <SelectPrimitive.Item key={option.value} value={option.value} disabled={option.disabled} className={itemClass}>
                  <SelectPrimitive.ItemText className="min-w-0 flex-1">
                    <ItemBody option={option} />
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="shrink-0">
                    <Check className="size-3.5" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function SearchSelect(props: SelectProps) {
  const items = useMemo(
    () => Combobox.createItems(props.options, { getValue: (o) => o.value, getLabel: (o) => o.label }),
    [props.options],
  );
  const selected = props.options.find((o) => o.value === props.value);
  return (
    <Combobox.Root
      items={items}
      value={props.value}
      name={props.name}
      disabled={props.disabled}
      autoHighlight
      onValueChange={(value) => {
        if (typeof value === "string" && value !== props.value) props.onValueChange(value);
      }}
    >
      <Combobox.Trigger id={props.id} aria-label={props["aria-label"]} className={cn(triggerClass(props.size), props.className)}>
        <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label ?? props.placeholder}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner className="z-[60] outline-none" sideOffset={4} align="start">
          <Combobox.Popup className={cn(popupClass, "flex flex-col")} aria-label={props["aria-label"] ?? props.placeholder}>
            <div className="relative shrink-0 border-b">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Combobox.Input
                placeholder={props.searchPlaceholder ?? "Suchen…"}
                className="h-9 w-full min-w-56 bg-transparent pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground any-pointer-coarse:text-base"
              />
            </div>
            <Combobox.Empty>
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">{props.emptyText ?? "Nichts gefunden."}</p>
            </Combobox.Empty>
            <Combobox.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 scroll-py-1 empty:p-0">
              {(option: SelectOption) => (
                <Combobox.Item key={option.value} value={option.value} disabled={option.disabled} className={itemClass}>
                  <ItemBody option={option} />
                  <Combobox.ItemIndicator className="shrink-0">
                    <Check className="size-3.5" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
