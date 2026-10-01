"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { createCommentAction, deleteCommentAction, updateCommentAction } from "@/app/(app)/tasks/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { mentionToken } from "@/lib/mentions";
import type { ActionResult } from "@/server/action-result";
import type { TaskDetail } from "@/server/tasks/queries";
import { MarkdownText } from "./markdown-text";

type Comment = TaskDetail["comments"][number];

function dateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value));
}

function Composer({ initial = "", members, onSave, onCancel }: {
  initial?: string;
  members: TaskDetail["members"];
  onSave: (body: string) => Promise<ActionResult<void>>;
  onCancel?: () => void;
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

  function insertMention(member: TaskDetail["members"][number]) {
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
      <Textarea ref={input} aria-label={onCancel ? "Kommentar bearbeiten" : "Neuer Kommentar"} rows={3}
        value={body} maxLength={10_000} disabled={pending} placeholder="Kommentar schreiben… @ für Erwähnungen"
        onChange={(event) => { setBody(event.target.value); findMention(event.target.value, event.target.selectionStart); }}
        onClick={(event) => findMention(body, event.currentTarget.selectionStart)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setSearch(null);
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
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>{onCancel ? "Speichern" : "Kommentieren"}</Button>
        {onCancel && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onCancel}>Abbrechen</Button>}
      </div>
    </form>
  );
}

function CommentRow({ comment, detail }: { comment: Comment; detail: TaskDetail }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const own = comment.authorId === detail.viewerId;
  const canDelete = own || detail.canManageProject;

  async function remove() {
    setDeleting(true);
    const result = await deleteCommentAction(comment.id);
    setDeleting(false);
    if (!result.ok) toast.error(result.error.message);
  }

  return <li className="space-y-2 rounded-md border p-3">
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <strong>{comment.authorName}</strong>
      <time className="text-muted-foreground" dateTime={comment.createdAt}>{dateTime(comment.createdAt)}{comment.editedAt ? " · bearbeitet" : ""}</time>
    </div>
    {editing ? <Composer initial={comment.body} members={detail.members} onSave={(body) => updateCommentAction(comment.id, body)} onCancel={() => setEditing(false)} />
      : <MarkdownText text={comment.body} mentionIds={comment.mentionIds} />}
    {!editing && (own || canDelete) && <div className="flex gap-2">
      {own && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Bearbeiten</Button>}
      {canDelete && <Button size="sm" variant="ghost" disabled={deleting} onClick={() => void remove()}>Löschen</Button>}
    </div>}
  </li>;
}

export function TaskComments({ detail }: { detail: TaskDetail }) {
  return <section className="space-y-3 border-t pt-4">
    <h2 className="text-sm font-medium">Kommentare ({detail.comments.length})</h2>
    {detail.comments.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Kommentare.</p>
      : <ul className="space-y-2">{detail.comments.map((comment) => <CommentRow key={comment.id} comment={comment} detail={detail} />)}</ul>}
    {detail.canComment && <Composer members={detail.members} onSave={(body) => createCommentAction(detail.id, body)} />}
  </section>;
}
