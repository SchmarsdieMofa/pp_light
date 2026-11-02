import { Appointments } from "@/components/appointments/appointments";
import { listAppointments } from "@/server/appointments/service";
import { db } from "@/server/db/client";
import { can, projectCtx } from "@/server/permissions";
import { loadProject } from "@/server/projects/loaders";
import { listProjectTasks } from "@/server/tasks/queries";

export default async function AppointmentsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { actor, project, role } = await loadProject(id);
  const [appointments, tasks] = await Promise.all([
    listAppointments(db(), actor, { projectId: project.id }), listProjectTasks(db(), project.id),
  ]);
  return <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
    <Appointments projectId={project.id} appointments={appointments} tasks={tasks.map(({ id, path, title }) => ({ id, path, title }))}
      canEdit={can(actor, "task.update", projectCtx(role))} />
  </div>;
}
