import { LabelManager } from "@/components/projects/label-manager";
import { listProjectGroups } from "@/server/groups/project-groups";
import { MemberManager } from "@/components/projects/member-manager";
import { PhaseManager } from "@/components/projects/phase-manager";
import { ProjectDetails } from "@/components/projects/project-details";
import { DeleteProject, ProjectLifecycle } from "@/components/projects/project-lifecycle";
import { SettingsSection } from "@/components/projects/settings-ui";
import { StatusManager } from "@/components/projects/status-manager";
import { db } from "@/server/db/client";
import { listLabels } from "@/server/labels/service";
import { can, projectCtx } from "@/server/permissions";
import { listPhases } from "@/server/phases/queries";
import { loadProject } from "@/server/projects/loaders";
import { listMembers, listStatuses } from "@/server/projects/service";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, project, role, memberRole } = await loadProject(id);
  const [columns, labels, members, projectGroupList, phases] = await Promise.all([
    listStatuses(db(), project.id),
    listLabels(db(), project.id),
    listMembers(db(), project.id),
    listProjectGroups(db(), project.id),
    listPhases(db(), project.id),
  ]);
  const canManage = can(actor, "project.update", projectCtx(role));
  const canManageMembers = can(actor, "project.manageMembers", projectCtx(role));
  // Lifecycle actions use the unmasked role: an archived project must stay restorable by its owners.
  const canSteer = can(actor, "project.update", projectCtx(memberRole));

  const sections = [
    { id: "allgemein", label: "Allgemein" },
    { id: "spalten", label: "Spalten" },
    { id: "phasen", label: "Phasen" },
    { id: "labels", label: "Labels" },
    { id: "mitglieder", label: "Mitglieder" },
    ...(canSteer ? [{ id: "projektstatus", label: "Projektstatus" }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-10">
      <nav aria-label="Einstellungsbereiche" className="flex flex-wrap gap-1">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            {s.label}
          </a>
        ))}
      </nav>

      <SettingsSection id="allgemein" title="Allgemein" description="Änderungen werden automatisch gespeichert, sobald du ein Feld verlässt.">
        <ProjectDetails projectId={project.id} name={project.name} description={project.description} projectKey={project.key} canManage={canManage} />
      </SettingsSection>

      <SettingsSection id="spalten" title="Board-Spalten" description="Reihenfolge, Name und Farbe der Board-Spalten. „Erledigt“-Spalten zählen Aufgaben als abgeschlossen.">
        <StatusManager projectId={project.id} statuses={columns.map(({ id, name, color, isDone }) => ({ id, name, color, isDone }))} canManage={canManage} />
      </SettingsSection>

      <SettingsSection id="phasen" title="Phasen und Meilensteine" description="Eine Phase ist ein Zeitabschnitt des Projekts (z. B. Planung, Umsetzung, Abnahme) mit Start und Ende; Aufgaben lassen sich ihr zuordnen und werden im Gantt-Diagramm darunter gruppiert. Ein Meilenstein ist ein einzelner Stichtag ohne Dauer, z. B. „Go-live“.">
        <PhaseManager projectId={project.id} phases={phases} canManage={canManage} />
      </SettingsSection>

      <SettingsSection id="labels" title="Labels" description="Schlagworte zum Filtern von Aufgaben.">
        <LabelManager projectId={project.id} labels={labels} canManage={canManage} />
      </SettingsSection>

      <SettingsSection id="mitglieder" title="Mitglieder" description="Wer das Projekt sieht und was er darin tun darf.">
        <MemberManager projectId={project.id} members={members} groups={projectGroupList} canManage={canManageMembers} />
      </SettingsSection>

      {canSteer && (
        <>
          <SettingsSection id="projektstatus" title="Projektstatus" description="Projekt zum Ende bringen oder ruhen lassen.">
            <ProjectLifecycle
              projectId={project.id}
              archivedAt={project.archivedAt?.toISOString() ?? null}
              completedAt={project.completedAt?.toISOString() ?? null}
            />
          </SettingsSection>
          <SettingsSection id="loeschen" title="Gefahrenzone" tone="danger">
            <DeleteProject projectId={project.id} projectKey={project.key} projectName={project.name} />
          </SettingsSection>
        </>
      )}
    </div>
  );
}
