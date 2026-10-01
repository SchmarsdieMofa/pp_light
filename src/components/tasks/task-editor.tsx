"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { setAssigneesAction, setLabelsAction, undoScheduleAction, updateTaskAction } from "@/app/(app)/tasks/actions";
import { Input } from "@/components/ui/input";
import { isPlausibleDate } from "@/lib/dates";
import { TASK_PRIORITIES, type TaskPriority } from "@/lib/enums";
import { PRIORITY_LABELS } from "@/lib/priority";
import type { TaskPatch } from "@/lib/schemas/task";
import type { TaskDetail } from "@/server/tasks/queries";
import { MultiSelect } from "./multi-select";
import { TaskActivity } from "./task-activity";
import { TaskAttachments } from "./task-attachments";
import { TaskChecklist } from "./task-checklist";
import { TaskComments } from "./task-comments";
import { TaskDescription } from "./task-description";
import { TaskDependencies } from "./task-dependencies";
import { TaskSubtasks } from "./task-subtasks";
import { useTaskHref } from "./use-task-href";

const fieldClass = "h-8 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-60";

/**
 * Optimistic-lock editor.
 * - `updatedAt` only advances through *our own* successful saves – never from re-rendered props – so a
 *   change by someone else is always detected as CONFLICT on our next save.
 * - Saves run one after another: a quick "title, then status" must not race against its own stamp.
 * Render with key={detail.id}.
 */
export function TaskEditor({ detail }: { detail: TaskDetail }) {
  const latestUpdatedAt = useRef(detail.updatedAt);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const href = useTaskHref();
  const disabled = !detail.canEdit;

  function save(patch: TaskPatch): Promise<boolean> {
    const run = queue.current.then(() => saveNow(patch));
    queue.current = run.catch(() => undefined);
    return run;
  }

  async function saveNow(patch: TaskPatch): Promise<boolean> {
    const res = await updateTaskAction(detail.id, latestUpdatedAt.current, patch);
    if (res.ok) {
      latestUpdatedAt.current = res.data.updatedAt;
      if (res.data.movedCount > 0 && res.data.groupId) {
        const count = res.data.movedCount;
        const groupId = res.data.groupId;
        toast.success(`${count} ${count === 1 ? "Aufgabe" : "Aufgaben"} verschoben`, {
          duration: 15_000,
          action: {
            label: "Rückgängig",
            onClick: async () => {
              const undone = await undoScheduleAction(groupId);
              if (undone.ok) window.location.reload();
              else toast.error(undone.error.message);
            },
          },
        });
      }
      return true;
    }
    if (res.error.code === "CONFLICT") {
      toast.error(res.error.message, {
        duration: Infinity,
        action: { label: "Neu laden", onClick: () => window.location.reload() },
      });
    } else {
      const fieldMessage = res.error.fieldErrors ? Object.values(res.error.fieldErrors).flat()[0] : undefined;
      toast.error(fieldMessage ?? res.error.message);
    }
    return false;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {detail.key}-{detail.number}
          {detail.parent && (
            <>
              {" · Teil von "}
              <Link href={href(detail.parent.id)} className="hover:underline">
                {detail.key}-{detail.parent.number} {detail.parent.title}
              </Link>
            </>
          )}
        </p>
        <TextField label="Titel" initial={detail.title} disabled={disabled} save={(title) => save({ title })} large />
      </div>

      <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-2 text-sm">
        <SelectField
          id="task-status"
          label="Status"
          initial={detail.statusId}
          disabled={disabled}
          options={detail.statuses.map((s) => ({ value: s.id, label: s.name }))}
          save={(statusId) => save({ statusId })}
        />
        <SelectField
          id="task-priority"
          label="Priorität"
          initial={detail.priority}
          disabled={disabled}
          options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
          save={(priority) => save({ priority: priority as TaskPriority })}
        />
        <SelectField
          id="task-phase"
          label="Phase"
          initial={detail.phaseId ?? ""}
          disabled={disabled}
          options={[{ value: "", label: "Keine Phase" }, ...detail.phases.map((phase) => ({ value: phase.id, label: phase.name }))]}
          save={(phaseId) => save({ phaseId: phaseId || null })}
        />
        <DateField id="task-start" label="Start" initial={detail.startDate} disabled={disabled} save={(startDate) => save({ startDate })} />
        <DateField id="task-due" label="Fällig" initial={detail.dueDate} disabled={disabled} save={(dueDate) => save({ dueDate })} />
        <span className="text-muted-foreground">Zuständige</span>
        <MultiSelect
          label="Zuständige"
          options={detail.members}
          selected={detail.assigneeIds}
          disabled={disabled}
          onChange={async (ids) => {
            const res = await setAssigneesAction(detail.id, ids);
            if (!res.ok) toast.error(res.error.message);
          }}
        />
        <span className="text-muted-foreground">Labels</span>
        <MultiSelect
          label="Labels"
          options={detail.labels}
          selected={detail.labelIds}
          disabled={disabled}
          onChange={async (ids) => {
            const res = await setLabelsAction(detail.id, ids);
            if (!res.ok) toast.error(res.error.message);
          }}
        />
      </div>

      <TaskDescription initial={detail.description} canEdit={!disabled} save={(description) => save({ description })} />

      {!detail.parent && <TaskSubtasks detail={detail} />}
      <TaskChecklist detail={detail} />
      <TaskDependencies detail={detail} />
      <TaskAttachments detail={detail} />
      <TaskComments detail={detail} />
      <TaskActivity entries={detail.activity} />
    </div>
  );
}

function TextField(props: {
  label: string;
  initial: string;
  disabled: boolean;
  save: (value: string) => Promise<boolean>;
  large?: boolean;
}) {
  const [value, setValue] = useState(props.initial);
  const [saved, setSaved] = useState(props.initial);

  async function commit() {
    const next = value.trim();
    if (!next) {
      setValue(saved);
      return;
    }
    if (next === saved) return;
    if (await props.save(next)) setSaved(next);
  }

  return (
    <Input
      aria-label={props.label}
      value={value}
      disabled={props.disabled}
      maxLength={200}
      className={props.large ? "h-10 text-lg font-semibold" : undefined}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function SelectField(props: {
  id: string;
  label: string;
  initial: string;
  disabled: boolean;
  options: { value: string; label: string }[];
  save: (value: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(props.initial);
  const commit = useLatestCommit(props.initial, setValue, props.save);
  return (
    <>
      <label htmlFor={props.id} className="text-muted-foreground">
        {props.label}
      </label>
      <select
        id={props.id}
        className={fieldClass}
        value={value}
        disabled={props.disabled}
        onChange={(e) => {
          setValue(e.target.value);
          void commit(e.target.value);
        }}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}

function DateField(props: {
  id: string;
  label: string;
  initial: string | null;
  disabled: boolean;
  save: (value: string | null) => Promise<boolean>;
}) {
  const [value, setValue] = useState(props.initial ?? "");
  const commit = useLatestCommit(props.initial ?? "", setValue, (v) => props.save(v || null));
  return (
    <>
      <label htmlFor={props.id} className="text-muted-foreground">
        {props.label}
      </label>
      <input
        id={props.id}
        type="date"
        className={fieldClass}
        value={value}
        disabled={props.disabled}
        onChange={(e) => {
          setValue(e.target.value);
          // Typing a year digit by digit yields 0002-…, 0020-…: only save complete, plausible dates (or clearing).
          if (e.target.value === "" || isPlausibleDate(e.target.value)) void commit(e.target.value);
        }}
      />
    </>
  );
}

/**
 * Saves the newest value; on failure reverts to the last saved value – but only if no newer value was
 * entered meanwhile (an older failing request must not overwrite what the user is typing now).
 */
function useLatestCommit(
  initial: string,
  setValue: (value: string) => void,
  save: (value: string) => Promise<boolean>,
) {
  const latest = useRef(0);
  const saved = useRef(initial);
  return async (value: string) => {
    const request = ++latest.current;
    const ok = await save(value);
    if (ok) saved.current = value;
    else if (request === latest.current) setValue(saved.current);
  };
}
