"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createCommentAction, deleteCommentAction, updateCommentAction } from "@/app/(app)/tasks/actions";
import { Button } from "@/components/ui/button";
import type { TaskDetail } from "@/server/tasks/queries";
import { MarkdownText } from "./markdown-text";
import { MentionComposer } from "./mention-composer";

type Comment = TaskDetail["comments"][number];

function dateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value));
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
    {editing ? <MentionComposer initial={comment.body} members={detail.members} onSave={(body) => updateCommentAction(comment.id, body)} onCancel={() => setEditing(false)}
        label="Kommentar bearbeiten" placeholder="Kommentar schreiben… @ für Erwähnungen" submitLabel="Speichern" />
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
    {detail.canComment && <MentionComposer members={detail.members} onSave={(body) => createCommentAction(detail.id, body)}
      label="Neuer Kommentar" placeholder="Kommentar schreiben… @ für Erwähnungen" submitLabel="Kommentieren" />}
  </section>;
}
