import { EmptyState } from "@/components/shell/empty-state";
import { loadProject } from "@/server/projects/loaders";

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  await loadProject((await params).id);
  return <EmptyState title="Noch keine Aufgaben" text="Aufgaben dieses Projekts erscheinen hier als Tabelle." />;
}
