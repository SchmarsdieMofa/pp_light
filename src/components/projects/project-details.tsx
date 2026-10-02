"use client";

import { useState } from "react";
import { updateProjectDetailsAction } from "@/app/(app)/projects/actions";
import { AutosaveInput, useRunner } from "./settings-ui";

/** Name and description, saved when leaving the field. The key is fixed: it is part of every task number. */
export function ProjectDetails(props: { projectId: string; name: string; description: string; projectKey: string; canManage: boolean }) {
  const [description, setDescription] = useState(props.description);
  const [savedDescription, setSavedDescription] = useState(props.description);
  const { run } = useRunner();
  const save = (patch: { name?: string; description?: string }) =>
    updateProjectDetailsAction(props.projectId, { name: props.name, description: savedDescription, ...patch });

  return (
    <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-start">
      <dt className="pt-1.5 text-muted-foreground"><label htmlFor="project-name">Name</label></dt>
      <dd>
        <AutosaveInput id="project-name" label="Projektname" value={props.name} required maxLength={100} disabled={!props.canManage}
          onSave={(name) => save({ name })} className="-ml-2 text-base font-medium" />
      </dd>
      <dt className="text-muted-foreground">Kürzel</dt>
      <dd>
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{props.projectKey}</span>
        <span className="ml-2 text-xs text-muted-foreground">fest – steckt in jeder Aufgabennummer ({props.projectKey}-1, {props.projectKey}-2 …)</span>
      </dd>
      <dt className="pt-1.5 text-muted-foreground"><label htmlFor="project-description">Beschreibung</label></dt>
      <dd>
        <textarea
          id="project-description"
          rows={3}
          maxLength={2000}
          value={description}
          disabled={!props.canManage}
          placeholder={props.canManage ? "Worum geht es? Ziel, Umfang, Ansprechpartner …" : "Keine Beschreibung."}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            const next = description.trim();
            if (next === savedDescription) return;
            run(() => save({ description: next }), () => setSavedDescription(next), () => setDescription(savedDescription));
          }}
          className="-ml-2 w-full resize-y rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none hover:border-input focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 disabled:hover:border-transparent"
        />
      </dd>
    </dl>
  );
}
