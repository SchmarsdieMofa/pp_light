"use client";

import { Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { deleteTaskAction } from "@/app/(app)/tasks/actions";
import { ConfirmAction, useRunner } from "@/components/projects/settings-ui";
import { buildHref, normalizeSearchParams } from "@/lib/urls";
import type { TaskDetail } from "@/server/tasks/queries";

/** Deletes the task (and its subtasks) after a confirmation, then leaves the now-missing task behind. */
export function DeleteTask({ detail }: { detail: Pick<TaskDetail, "id" | "key" | "path" | "title" | "projectId" | "subtasks"> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pending, run } = useRunner();
  const reference = `${detail.key}-${detail.path}`;
  const subtasks = detail.subtasks.length;

  function leave() {
    // The task page itself is gone with the task; the overlay only drops `?task=` and stays on its view.
    if (pathname.startsWith("/tasks/")) return router.push(`/projects/${detail.projectId}/board`);
    router.push(buildHref(pathname, normalizeSearchParams(Object.fromEntries(searchParams.entries())), { task: null }), { scroll: false });
  }

  return (
    <ConfirmAction
      trigger={
        <>
          <Trash2 /> Aufgabe löschen
        </>
      }
      triggerVariant="ghost"
      triggerSize="sm"
      title={`Aufgabe ${reference} löschen?`}
      description={
        <>
          „{detail.title}“ wird mit {subtasks > 0 ? `${subtasks === 1 ? "ihrer Unteraufgabe" : `ihren ${subtasks} Unteraufgaben`}, ` : ""}
          allen Kommentaren, der Checkliste und den Anhängen endgültig gelöscht. Das lässt sich nicht rückgängig machen.
        </>
      }
      confirmLabel="Endgültig löschen"
      pending={pending}
      onConfirm={() =>
        run(
          () => deleteTaskAction(detail.id),
          () => {
            toast.success(`Aufgabe ${reference} gelöscht`);
            leave();
          },
        )
      }
    />
  );
}
