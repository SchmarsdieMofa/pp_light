import { CheckCircle2, Circle, MessageSquare } from "lucide-react";
import Link from "next/link";
import { CloseProjectForm } from "@/components/projects/close-project-form";
import { ProjectLifecycle } from "@/components/projects/project-lifecycle";
import { WithTaskPanel } from "@/components/tasks/task-panel";
import { formatDate, todayInZone } from "@/lib/dates";
import { normalizeSearchParams } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { db } from "@/server/db/client";
import { can, projectCtx } from "@/server/permissions";
import { getProjectReport } from "@/server/projects/lifecycle";
import { loadProject } from "@/server/projects/loaders";

const ROLE_LABELS = { owner: "Owner", member: "Mitglied", guest: "Gast" } as const;

export default async function ReviewPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const params = normalizeSearchParams(await props.searchParams);
  const { actor, project, memberRole } = await loadProject(id);
  const today = todayInZone();
  const report = await getProjectReport(db(), actor, project.id, today);
  const canSteer = can(actor, "project.update", projectCtx(memberRole));
  const progress = report.tasks.total === 0 ? 0 : Math.round((report.tasks.done / report.tasks.total) * 100);
  const reached = report.milestones.filter((m) => m.reached).length;

  return (
    <WithTaskPanel taskId={params.task}>
      <div className="mx-auto w-full max-w-3xl space-y-6 pb-10">
        <div>
          <h2 className="text-lg font-semibold">{project.archivedAt ? "Abschlussbericht" : "Abschluss-Review"}</h2>
          <p className="text-sm text-muted-foreground">
            {project.archivedAt
              ? "So stand das Projekt beim Abschluss."
              : "Prüfe das Ergebnis und kläre, was noch offen ist. Danach schließt du das Projekt ab – es wird archiviert und schreibgeschützt."}
          </p>
        </div>

        <section aria-label="Kennzahlen" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Erledigt" value={`${progress} %`} hint={`${report.tasks.done} von ${report.tasks.total} Aufgaben`} />
          <Stat label="Offen" value={String(report.tasks.open)} hint={report.tasks.subtasks ? `+ ${report.tasks.subtasks} Unteraufgaben gesamt` : "Hauptaufgaben"} />
          <Stat label="Überfällig" value={String(report.tasks.overdue)} tone={report.tasks.overdue > 0 ? "danger" : undefined} hint="offen und Termin vorbei" />
          <Stat label="Meilensteine" value={`${reached}/${report.milestones.length}`} hint="erreicht" />
        </section>

        {report.tasks.total > 0 && (
          <section aria-label="Verteilung nach Status" className="space-y-2">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              {report.byStatus.filter((s) => s.count > 0).map((s) => (
                <span key={s.name} style={{ width: `${(s.count / report.tasks.total) * 100}%`, backgroundColor: s.color }} />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {report.byStatus.map((s) => (
                <li key={s.name} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} /> {s.name} {s.count}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Card title={`Offene Aufgaben (${report.tasks.open})`}>
          {report.openTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Alles erledigt. 🎉</p>
          ) : (
            <ul className="divide-y text-sm">
              {report.openTasks.map((t) => {
                const overdue = !!t.dueDate && t.dueDate < today;
                return (
                  <li key={t.id}>
                    <Link href={`?task=${t.id}`} scroll={false} className="flex items-center gap-3 py-2 hover:bg-muted/50">
                      <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{project.key}-{t.number}</span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground sm:block">{t.statusName}</span>
                      <span className={cn("w-20 shrink-0 text-right text-xs tabular-nums", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {t.dueDate ? formatDate(t.dueDate) : "–"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="grid gap-6 sm:grid-cols-2">
          <Card title="Meilensteine">
            {report.milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Meilensteine angelegt.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {report.milestones.map((m) => (
                  <li key={m.name} className="flex items-center gap-2">
                    {m.reached ? <CheckCircle2 className="size-4 text-emerald-500" aria-label="erreicht" /> : <Circle className="size-4 text-muted-foreground" aria-label="offen" />}
                    <span className="flex-1">{m.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{m.date ? formatDate(m.date) : "ohne Datum"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Beiträge">
            <ul className="space-y-1.5 text-sm">
              {report.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{m.name} <span className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</span></span>
                  <span className="text-xs text-muted-foreground tabular-nums">{m.done}/{m.assigned} erledigt</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
              <MessageSquare className="size-3" aria-hidden /> {report.comments} {report.comments === 1 ? "Kommentar" : "Kommentare"} · {report.attachments} {report.attachments === 1 ? "Datei" : "Dateien"}
              {report.lastDueDate && ` · letzter Termin ${formatDate(report.lastDueDate)}`}
            </p>
          </Card>
        </div>

        {project.archivedAt ? (
          <>
            {project.closingNote && (
              <Card title="Abschlussnotiz">
                <p className="whitespace-pre-wrap text-sm">{project.closingNote}</p>
              </Card>
            )}
            {canSteer && (
              <ProjectLifecycle projectId={project.id} archivedAt={project.archivedAt.toISOString()} completedAt={project.completedAt?.toISOString() ?? null} />
            )}
          </>
        ) : canSteer ? (
          <CloseProjectForm projectId={project.id} openCount={report.tasks.open} />
        ) : (
          <p className="text-sm text-muted-foreground">Abschließen können nur Owner des Projekts.</p>
        )}
      </div>
    </WithTaskPanel>
  );
}

function Stat(props: { label: string; value: string; hint: string; tone?: "danger" }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{props.label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", props.tone === "danger" && "text-destructive")}>{props.value}</p>
      <p className="truncate text-xs text-muted-foreground">{props.hint}</p>
    </div>
  );
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={props.title} className="rounded-xl border bg-card px-4 py-3">
      <h3 className="mb-2 text-sm font-medium">{props.title}</h3>
      {props.children}
    </section>
  );
}
