"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Checkbox from the design templates: rounded square that fills with the primary color, the check pops in.
 * Label it with an enclosing <label> or `aria-label`.
 */
export function Checkbox({ className, onCheckedChange, ...props }: Omit<CheckboxPrimitive.Root.Props, "onCheckedChange"> & {
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <CheckboxPrimitive.Root
      {...props}
      onCheckedChange={(checked) => onCheckedChange?.(checked)}
      className={cn(
        "peer inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border border-input bg-background text-primary-foreground shadow-xs transition-colors outline-none",
        "hover:border-primary/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-checked:border-primary data-checked:bg-primary",
        "data-disabled:cursor-default data-disabled:opacity-50",
        className,
      )}
    >
      <CheckboxPrimitive.Indicator className="flex transition-transform duration-150 ease-out data-starting-style:scale-50 data-ending-style:scale-50 data-unchecked:hidden">
        <Check className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
