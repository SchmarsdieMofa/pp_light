import { LabelManager } from "@/components/projects/label-manager";
import { MemberManager } from "@/components/projects/member-manager";
import { PhaseManager } from "@/components/projects/phase-manager";
import { StatusManager } from "@/components/projects/status-manager";
import { db } from "@/server/db/client";
import { listLabels } from "@/server/labels/service";
import { can, projectCtx } from "@/server/permissions";
import { listPhases } from "@/server/phases/queries";
import { loadProject } from "@/server/projects/loaders";
import { listMembers, listStatuses } from "@/server/projects/service";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, project, role } = await loadProject(id);
  const [columns, labels, members, phases] = await Promise.all([
    listStatuses(db(), project.id),
    listLabels(db(), project.id),
    listMembers(db(), project.id),
    listPhases(db(), project.id),
  ]);
  return (
    <div className="max-w-4xl space-y-8">
      <section className="space-y-1">
        <h2 className="text-sm font-medium">Kürzel</h2>
        <p className="text-sm text-muted-foreground">{project.key}</p>
      </section>
      {project.description && (
        <section className="space-y-1">
          <h2 className="text-sm font-medium">Beschreibung</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{project.description}</p>
        </section>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Status-Spalten</h2>
        <StatusManager
          projectId={project.id}
          statuses={columns.map(({ id, name, color, isDone }) => ({ id, name, color, isDone }))}
          canManage={can(actor, "project.update", projectCtx(role))}
        />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Phasen und Meilensteine</h2>
        <PhaseManager projectId={project.id} phases={phases} canManage={can(actor, "project.update", projectCtx(role))} />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Labels</h2>
        <LabelManager projectId={project.id} labels={labels} canManage={can(actor, "project.update", projectCtx(role))} />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Mitglieder</h2>
        <MemberManager
          projectId={project.id}
          members={members}
          canManage={can(actor, "project.manageMembers", projectCtx(role))}
        />
      </section>
    </div>
  );
}
