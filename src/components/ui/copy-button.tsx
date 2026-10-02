"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Copies text and confirms with an animated check (after the AnimatedCopyButton template, CSS instead of
 * framer-motion). `text` may be a function, e.g. to build an absolute URL at click time.
 */
export function CopyButton(props: { text: string | (() => string); label: string; children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(typeof props.text === "function" ? props.text() : props.text);
          setCopied(true);
        } catch {
          // Clipboard blocked (insecure context, permissions): nothing to confirm.
        }
      }}
      className={cn("relative inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground", props.className)}
    >
      <span className="relative inline-flex size-3.5 items-center justify-center">
        <Copy className={cn("absolute size-3.5 transition-all duration-200", copied ? "scale-50 rotate-45 opacity-0" : "scale-100 opacity-100")} />
        <Check
          className={cn(
            "absolute size-3.5 text-emerald-500 transition-all duration-200 ease-[cubic-bezier(.34,1.56,.64,1)]",
            copied ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-45 opacity-0",
          )}
        />
        {copied && <span aria-hidden className="absolute inset-[-6px] animate-ping rounded-full bg-emerald-500/20 [animation-iteration-count:1]" />}
      </span>
      {props.children}
      <span role="status" className="sr-only">{copied ? "Kopiert" : ""}</span>
    </button>
  );
}
