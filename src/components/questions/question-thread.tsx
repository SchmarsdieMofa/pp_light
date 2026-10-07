"use client";

import { CheckCircle2, CircleHelp, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  deletePostAction,
  deleteQuestionAction,
  editPostAction,
  postAnswerAction,
  renameQuestionAction,
  reopenQuestionAction,
  resolveQuestionAction,
} from "@/app/(app)/questions/actions";
import { AutosaveInput, ConfirmAction, useRunner } from "@/components/projects/settings-ui";
import { MarkdownText } from "@/components/tasks/markdown-text";
import { MentionComposer, type MentionableMember } from "@/components/tasks/mention-composer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MENTION_PATTERN } from "@/lib/mentions";
import type { PostView, QuestionDetail } from "@/server/questions/service";

const dateTime = (value: Date) => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value));

/** The closing summary starts from the latest answer (or the question itself), with mentions as plain names. */
function suggestSummary(detail: QuestionDetail): string {
  if (detail.summary) return detail.summary;
  const last = detail.posts.length > 1 ? detail.posts[detail.posts.length - 1] : null;
  return last ? last.body.replace(MENTION_PATTERN, "@$1") : "";
}

export function StatusBadge({ status }: { status: QuestionDetail["status"] }) {
  return status === "open" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
      <CircleHelp className="size-3" aria-hidden /> Offen
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="size-3" aria-hidden /> Geklärt
    </span>
  );
}

export function QuestionThread({ detail, members, viewerId, onDeleted }: { detail: QuestionDetail; members: MentionableMember[]; viewerId: string; onDeleted?: () => void }) {
  const { pending, run } = useRunner();
  const [resolving, setResolving] = useState(false);
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={detail.status} />
          <span className="text-xs text-muted-foreground">
            {detail.authorName} · {dateTime(detail.createdAt)}
          </span>
        </div>
        {detail.canManage && detail.canWrite ? (
          <AutosaveInput
            value={detail.title}
            label="Titel der Frage"
            required
            maxLength={200}
            className="-ml-2 w-full text-xl font-semibold"
            onSave={(next) => renameQuestionAction(detail.id, next)}
          />
        ) : (
          <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{detail.title}</h2>
        )}
      </header>

      {detail.status === "resolved" && (
        <section aria-label="Zusammenfassung" className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" aria-hidden /> Geklärt
            {detail.resolvedByName && detail.resolvedAt && (
              <span className="font-normal text-muted-foreground">
                · {detail.resolvedByName}, {dateTime(detail.resolvedAt)}
              </span>
            )}
          </h3>
          <MarkdownText text={detail.summary} />
        </section>
      )}

      <section aria-label="Verlauf">
        <ol className="space-y-2">
          {detail.posts.map((post) => (
            <PostRow key={post.id} post={post} members={members} canEdit={post.authorId === viewerId && detail.canWrite} canDelete={!post.isQuestion && (post.authorId === viewerId || detail.canManage) && detail.canWrite} />
          ))}
        </ol>
      </section>

      {detail.canWrite && (
        <MentionComposer
          members={members}
          onSave={(body) => postAnswerAction(detail.id, body)}
          label="Neue Antwort"
          placeholder="Antwort schreiben… @ für Erwähnungen"
          submitLabel="Antworten"
        />
      )}

      {detail.canWrite && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {detail.status === "open" ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setResolving(true)}>
              <CheckCircle2 /> Als geklärt markieren
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => reopenQuestionAction(detail.id))}>
              <RotateCcw /> Wieder öffnen
            </Button>
          )}
          {detail.canManage && (
            <span className="ml-auto">
              <ConfirmAction
                trigger={<><Trash2 /> Frage löschen</>}
                triggerSize="sm"
                triggerVariant="outline"
                title="Frage löschen?"
                description="Die Frage mit allen Antworten und der Zusammenfassung wird endgültig gelöscht."
                confirmLabel="Löschen"
                pending={pending}
                onConfirm={() => run(() => deleteQuestionAction(detail.id), onDeleted)}
              />
            </span>
          )}
        </div>
      )}

      <ResolveDialog detail={detail} open={resolving} onOpenChange={setResolving} />
    </div>
  );
}

function PostRow({ post, members, canEdit, canDelete }: { post: PostView; members: MentionableMember[]; canEdit: boolean; canDelete: boolean }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    const result = await deletePostAction(post.id);
    setDeleting(false);
    if (!result.ok) toast.error(result.error.message);
  }

  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <strong>
          {post.authorName}
          {post.isQuestion && <span className="ml-1.5 font-normal text-muted-foreground">stellt die Frage</span>}
        </strong>
        <time className="text-muted-foreground" dateTime={new Date(post.createdAt).toISOString()}>
          {dateTime(post.createdAt)}
          {post.editedAt ? " · bearbeitet" : ""}
        </time>
      </div>
      {editing ? (
        <MentionComposer
          initial={post.body}
          members={members}
          onSave={(body) => editPostAction(post.id, body)}
          onCancel={() => setEditing(false)}
          label="Beitrag bearbeiten"
          placeholder="Text… @ für Erwähnungen"
          submitLabel="Speichern"
        />
      ) : (
        <MarkdownText text={post.body} mentionIds={post.mentionIds} />
      )}
      {!editing && (canEdit || canDelete) && (
        <div className="flex gap-2">
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Bearbeiten
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="ghost" disabled={deleting} onClick={() => void remove()}>
              Löschen
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function ResolveDialog({ detail, open, onOpenChange }: { detail: QuestionDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Frage als geklärt markieren</DialogTitle>
          <DialogDescription>Fasse kurz zusammen, was geklärt wurde. Die Zusammenfassung steht oben in der Frage, damit niemand den ganzen Verlauf lesen muss.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so it starts from the latest answer each time. */}
        <ResolveForm detail={detail} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ResolveForm({ detail, onDone }: { detail: QuestionDetail; onDone: () => void }) {
  const { pending, run } = useRunner();
  const [summary, setSummary] = useState(() => suggestSummary(detail));
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => resolveQuestionAction(detail.id, summary), onDone);
      }}
    >
      <Textarea aria-label="Zusammenfassung" rows={5} maxLength={5000} autoFocus value={summary} onChange={(event) => setSummary(event.target.value)} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={pending || !summary.trim()}>
          Als geklärt markieren
        </Button>
      </DialogFooter>
    </form>
  );
}
