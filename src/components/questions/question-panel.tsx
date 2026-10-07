import { MessageCircleQuestion, X } from "lucide-react";
import Link from "next/link";
import { TaskOverlay } from "@/components/tasks/task-overlay";
import { ScrollArea } from "@/components/ui/scroll-area";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listMembers } from "@/server/projects/service";
import { getQuestion } from "@/server/questions/service";
import { QuestionPanelBody } from "./question-panel-body";

/** One question as an overlay above the list; `?frage=` holds it, so links, reloads and the back button work. */
export async function QuestionPanel({ projectId, questionId, closeHref }: { projectId: string; questionId: string; closeHref: string }) {
  const actor = await requireActor();
  const detail = await getQuestion(db(), actor, questionId);
  // A question of another project must not open under this tab.
  const shown = detail && detail.projectId === projectId ? detail : null;
  const members = shown ? (await listMembers(db(), projectId)).map(({ id, name }) => ({ id, name })) : [];
  return (
    <TaskOverlay label="Frage" param="frage">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2 text-sm text-muted-foreground md:px-6">
        <MessageCircleQuestion className="size-4" aria-hidden />
        <span className="font-medium text-foreground">Frage</span>
        <Link
          href={closeHref}
          scroll={false}
          aria-label="Schließen"
          title="Schließen (Esc)"
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" /> <span className="hidden sm:inline">Schließen</span>
        </Link>
      </div>
      <ScrollArea className="flex-1" contentClassName="p-4 md:p-6" scrollFade>
        {shown ? (
          <QuestionPanelBody detail={shown} members={members} viewerId={actor.id} closeHref={closeHref} />
        ) : (
          <p className="text-sm text-muted-foreground">Frage nicht gefunden.</p>
        )}
      </ScrollArea>
    </TaskOverlay>
  );
}
