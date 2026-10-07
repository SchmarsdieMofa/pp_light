"use client";

import { ScrollArea as Primitive } from "@base-ui/react/scroll-area";
import { cn } from "@/lib/utils";

type Props = Primitive.Root.Props & {
  children: React.ReactNode;
  contentClassName?: string;
  orientation?: "vertical" | "horizontal" | "both";
  scrollFade?: boolean;
  viewportClassName?: string;
};

/**
 * Native scrolling with the subtle scrollbar and edge fade from the design template.
 * Flex column + `flex-1` viewport: `size-full` alone resolves to auto height inside a flex item whose
 * container only has a max-height, and the viewport then grows to its content instead of scrolling.
 */
export function ScrollArea({ children, className, contentClassName, orientation = "vertical", scrollFade = false, viewportClassName, ...props }: Props) {
  return (
    <Primitive.Root className={cn("relative flex min-h-0 min-w-0 flex-col", className)} {...props}>
      <Primitive.Viewport
        className={cn(
          "size-full min-h-0 flex-1 overscroll-contain rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          scrollFade &&
            "mask-t-from-[calc(100%-min(1.5rem,var(--scroll-area-overflow-y-start)))] mask-b-from-[calc(100%-min(1.5rem,var(--scroll-area-overflow-y-end)))]",
          viewportClassName,
        )}
      >
        <Primitive.Content
          className={contentClassName}
          // Base UI defaults to min-width: fit-content, which lets long text push
          // vertical-only content beyond its viewport and hide dialog actions.
          style={orientation === "vertical" ? { minWidth: 0 } : undefined}
        >{children}</Primitive.Content>
      </Primitive.Viewport>
      {orientation !== "horizontal" && <ScrollBar orientation="vertical" />}
      {orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
      {orientation === "both" && <Primitive.Corner />}
    </Primitive.Root>
  );
}

function ScrollBar({ orientation }: { orientation: "vertical" | "horizontal" }) {
  return (
    <Primitive.Scrollbar
      orientation={orientation}
      className="pointer-events-none m-1 flex opacity-0 transition-opacity data-hovering:pointer-events-auto data-hovering:opacity-100 data-scrolling:pointer-events-auto data-scrolling:opacity-100 data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:w-1.5"
    >
      <Primitive.Thumb className="relative flex-1 rounded-full bg-foreground/25" />
    </Primitive.Scrollbar>
  );
}
