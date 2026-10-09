"use client";

import { useRouter } from "next/navigation";
import { moveProjectToFolderAction } from "@/app/(app)/folders/actions";
import { Select } from "@/components/ui/select";
import type { ProjectRole } from "@/lib/enums";
import { useRunner } from "./settings-ui";

/** Which folder the project lives in. Moving it needs the project's owner, and for a target folder owner or member of it. */
export function ProjectFolderField(props: {
  projectId: string;
  folderId: string | null;
  folders: { id: string; name: string; role: ProjectRole }[];
  canManage: boolean;
}) {
  const { pending, run } = useRunner();
  const router = useRouter();
  const current = props.folders.find((folder) => folder.id === props.folderId);
  // A folder the person is not in cannot be named; it stays selected as "Ein anderer Ordner".
  const foreign = props.folderId && !current;
  // Leaving a folder is up to that folder's owners, whoever owns the project.
  const locked = Boolean(props.folderId) && current?.role !== "owner";
  const options = [
    { value: "", label: "Kein Ordner" },
    ...props.folders.filter((folder) => folder.role !== "guest" || folder.id === props.folderId).map((folder) => ({ value: folder.id, label: folder.name })),
    ...(foreign ? [{ value: props.folderId!, label: "Ein anderer Ordner", disabled: true }] : []),
  ];
  if (props.folders.length === 0 && !props.folderId) return null;
  return (
    <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-start">
      <dt className="pt-1.5 text-muted-foreground"><label htmlFor="project-folder">Ordner</label></dt>
      <dd className="space-y-1">
        <Select
          id="project-folder"
          className="w-full sm:w-72"
          value={props.folderId ?? ""}
          disabled={!props.canManage || locked || pending}
          options={options}
          onValueChange={(next) => run(() => moveProjectToFolderAction(props.projectId, next || null), () => router.refresh())}
        />
        {props.canManage && locked && <p className="text-xs text-muted-foreground">Das Projekt liegt in einem Ordner – verschieben dürfen es nur dessen Owner.</p>}
        <p className="text-xs text-muted-foreground">
          Wer im Ordner ist, hat hier automatisch dieselbe Rolle wie dort. Beim Wechsel verlieren Personen, die nur über den bisherigen Ordner Zugriff hatten, ihn.
        </p>
      </dd>
    </dl>
  );
}
