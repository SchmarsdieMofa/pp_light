import { MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { AskQuestionDialog } from "@/components/questions/ask-question-dialog";
import { QuestionPanel } from "@/components/questions/question-panel";
import { StatusBadge } from "@/components/questions/question-thread";
import { EmptyState } from "@/components/shell/empty-state";
import { buildHref, normalizeSearchParams } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { db } from "@/server/db/client";
import { can, projectCtx } from "@/server/permissions";
import { loadProject } from "@/server/projects/loaders";
import { listMembers } from "@/server/projects/service";
import { listQuestions } from "@/server/questions/service";

const dateOnly = (value: Date) => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(new Date(value));

const FILTERS = [
  { value: "open", label: "Offen" },
  { value: "resolved", label: "Geklärt" },
  { value: "all", label: "Alle" },
] as const;

export default async function QuestionsPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const params = normalizeSearchParams(await props.searchParams);
  const { actor, project, role } = await loadProject(id);
  const [all, members] = await Promise.all([listQuestions(db(), actor, project.id), listMembers(db(), project.id)]);
  const filter = params.status === "resolved" || params.status === "all" ? params.status : "open";
  const shown = filter === "all" ? all : all.filter((question) => question.status === (filter === "open" ? "open" : "resolved"));
  const counts = {
    open: all.filter((q) => q.status === "open").length,
    resolved: all.filter((q) => q.status === "resolved").length,
    all: all.length,
  };
  const base = `/projects/${project.id}/questions`;
  const closeHref = buildHref(base, params, { frage: null });

  return (
    <>
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Fragen filtern" className="flex flex-wrap gap-1">
            {FILTERS.map((item) => (
              <Link
                key={item.value}
                href={buildHref(base, params, { status: item.value === "open" ? null : item.value, frage: null })}
                aria-current={filter === item.value ? "true" : undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors",
                  filter === item.value ? "border-primary/40 bg-primary/10 font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label} <span className="text-xs tabular-nums text-muted-foreground">{counts[item.value]}</span>
              </Link>
            ))}
          </div>
          {can(actor, "question.ask", projectCtx(role)) && (
            <AskQuestionDialog projectId={project.id} members={members.map(({ id: memberId, name }) => ({ id: memberId, name }))} />
          )}
        </div>

        {shown.length === 0 ? (
          <EmptyState
            title={filter === "open" ? "Keine offenen Fragen" : filter === "resolved" ? "Noch nichts geklärt" : "Noch keine Fragen"}
            text={filter === "resolved" ? "Geklärte Fragen mit ihrer Zusammenfassung stehen hier." : "Stelle dem Projekt eine Frage; alle können antworten."}
          />
        ) : (
          <ul aria-label="Fragen" className="divide-y overflow-hidden rounded-lg border">
            {shown.map((question) => (
              <li key={question.id}>
                <Link href={buildHref(base, params, { frage: question.id })} scroll={false} className="block space-y-1 px-4 py-3 hover:bg-muted/40">
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={question.status} />
                    <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{question.title}</span>
                  </span>
                  {question.status === "resolved" && question.summary && (
                    <span className="line-clamp-2 block text-sm text-muted-foreground">{question.summary}</span>
                  )}
                  <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span>{question.authorName}</span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircleQuestion className="size-3" aria-hidden /> {Math.max(question.postCount - 1, 0)}{" "}
                      {question.postCount === 2 ? "Antwort" : "Antworten"}
                    </span>
                    <span>zuletzt {dateOnly(question.lastActivityAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {params.frage && <QuestionPanel projectId={project.id} questionId={params.frage} closeHref={closeHref} />}
    </>
  );
}
