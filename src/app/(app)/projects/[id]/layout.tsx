import { ProjectTabs } from "@/components/shell/project-tabs";
import { loadProject } from "@/server/projects/loaders";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { project } = await loadProject(id);
  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 pt-4">
        <h1 className="text-lg font-semibold">{project.name}</h1>
        <ProjectTabs projectId={project.id} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col p-6">{children}</div>
    </div>
  );
}
