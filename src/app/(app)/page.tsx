import { EmptyState } from "@/components/shell/empty-state";

export default function HomePage() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-xl font-semibold">Meine Arbeit</h1>
      <EmptyState title="Noch keine Aufgaben" text="Lege links ein Projekt an, um loszulegen." />
    </div>
  );
}
