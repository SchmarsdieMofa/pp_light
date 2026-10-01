import { EmptyState } from "@/components/shell/empty-state";
import { loadProject } from "@/server/projects/loaders";

export default async function GanttPage({ params }: { params: Promise<{ id: string }> }) {
  await loadProject((await params).id);
  return <EmptyState title="Noch keine Aufgaben" text="Sobald Aufgaben Termine haben, erscheinen sie hier im Zeitplan." />;
}
