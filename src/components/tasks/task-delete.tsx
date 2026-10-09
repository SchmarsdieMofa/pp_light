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
  // `subtasks` only lists direct children, so no count: deeper levels would make it wrong.
  const hasSubtasks = detail.subtasks.length > 0;

  function leave() {
    // The task page itself is gone with the task; the overlay only drops `?task=` and stays on its view.
    // replace: Back must not land on the dead task.
    if (pathname.startsWith("/tasks/")) return router.replace(`/projects/${detail.projectId}/board`);
    router.replace(buildHref(pathname, normalizeSearchParams(Object.fromEntries(searchParams.entries())), { task: null }), { scroll: false });
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
          „{detail.title}“ wird mit {hasSubtasks ? "ihren Unteraufgaben, " : ""}
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
