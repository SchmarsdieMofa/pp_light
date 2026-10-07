"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { mentionToken } from "@/lib/mentions";
import type { ActionResult } from "@/server/action-result";

export type MentionableMember = { id: string; name: string };

/** Text box with @-mention suggestions, for comments and for questions and answers. Clears itself after a successful save. */
export function MentionComposer({
  initial = "",
  members,
  onSave,
  onCancel,
  label,
  placeholder,
  submitLabel,
  rows = 3,
}: {
  initial?: string;
  members: MentionableMember[];
  onSave: (body: string) => Promise<ActionResult<unknown>>;
  onCancel?: () => void;
  /** Accessible name of the text box. */
  label: string;
  placeholder: string;
  submitLabel: string;
  rows?: number;
}) {
  const [body, setBody] = useState(initial);
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState<{ start: number; term: string } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const suggestions = search ? members.filter((member) => member.name.toLocaleLowerCase("de").includes(search.term.toLocaleLowerCase("de"))).slice(0, 6) : [];

  function findMention(value: string, cursor: number) {
    const match = /@([^@\s\[\]]*)$/.exec(value.slice(0, cursor));
    setSearch(match ? { start: cursor - match[0].length, term: match[1] } : null);
  }

  function insertMention(member: MentionableMember) {
    if (!search || !input.current) return;
    const cursor = input.current.selectionStart;
    const token = mentionToken(member.name, member.id);
    const next = body.slice(0, search.start) + token + " " + body.slice(cursor);
    setBody(next);
    setSearch(null);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(search.start + token.length + 1, search.start + token.length + 1);
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    const result = await onSave(body);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error.fieldErrors ? Object.values(result.error.fieldErrors).flat()[0] : result.error.message);
      return;
    }
    setBody("");
    setSearch(null);
    onCancel?.();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-2">
      <Textarea ref={input} aria-label={label} rows={rows}
        value={body} maxLength={10_000} disabled={pending} placeholder={placeholder}
        onChange={(event) => { setBody(event.target.value); findMention(event.target.value, event.target.selectionStart); }}
        onClick={(event) => findMention(body, event.currentTarget.selectionStart)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && suggestions.length > 0) { event.preventDefault(); setSearch(null); }
          if (event.key === "Enter" && suggestions.length > 0 && search) {
            event.preventDefault(); insertMention(suggestions[0]);
          }
        }} />
      {suggestions.length > 0 && (
        <div role="listbox" aria-label="Person erwähnen" className="rounded-md border bg-background p-1 shadow-sm">
          {suggestions.map((member) => <button key={member.id} type="button" role="option" aria-selected={false}
            className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
            onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(member)}>{member.name}</button>)}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>{submitLabel}</Button>
        {onCancel && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onCancel}>Abbrechen</Button>}
      </div>
    </form>
  );
}
