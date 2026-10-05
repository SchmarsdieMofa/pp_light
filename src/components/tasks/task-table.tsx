"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { ArrowDown, ArrowUp, ChevronRight, CheckSquare, GitBranch, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { completeTaskAction, reopenTaskAction } from "@/app/(app)/my-work/actions";
import { formatDate } from "@/lib/dates";
import type { TaskSort, TaskSortField } from "@/lib/task-list-params";
import { buildHref, type SearchParams } from "@/lib/urls";
import { cn } from "@/lib/utils";
import type { TaskListRow } from "@/server/tasks/queries";
import { PriorityBadge } from "./task-badges";

type Status = { id: string; name: string; color: string; isDone: boolean };
type Column = { field?: TaskSortField; label: string; className?: string };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

/**
 * Project tasks as a table, grouped by status (done groups start collapsed) or flat.
 * A checkbox completes or reopens a task in one click; the title opens the task overlay.
 */
export function TaskTable(props: {
  rows: TaskListRow[];
  statuses: Status[];
  sort: TaskSort;
  grouped: boolean;
  /** Start with every group open (e.g. while filtering, so matches in "done" are visible). */
  expandDone?: boolean;
  canEdit: boolean;
  today: string;
  basePath: string;
  params: SearchParams;
}) {
  const [, startTransition] = useTransition();
  const [doneOverride, setDone] = useOptimistic<Record<string, boolean>, { id: string; done: boolean }>(
    {},
    (current, change) => ({ ...current, [change.id]: change.done }),
  );
  const [collapsed, setCollapsed] = useState(
    () => new Set(props.expandDone ? [] : props.statuses.filter((s) => s.isDone).map((s) => s.id)),
  );

  function toggleDone(row: TaskListRow, done: boolean) {
    startTransition(async () => {
      setDone({ id: row.id, done });
      const res = done ? await completeTaskAction(row.id) : await reopenTaskAction(row.id);
      if (!res.ok) toast.error(res.error.message);
      else toast.success(`${row.key}-${row.number} ${done ? "erledigt" : "wieder geöffnet"}`);
    });
  }

  const columns: Column[] = [
    { label: "Erledigt", className: "w-9" },
    { field: "number", label: "Nr.", className: "hidden w-20 sm:table-cell" },
    { field: "title", label: "Titel" },
    ...(props.grouped ? [] : [{ field: "status" as const, label: "Status", className: "hidden w-32 sm:table-cell" }]),
    { label: "Zuständig", className: "hidden w-24 sm:table-cell" },
    { field: "priority", label: "Priorität", className: "hidden w-20 sm:table-cell" },
    { field: "dueDate", label: "Fällig", className: "w-24" },
  ];
  const sortHref = (field: TaskSortField) => {
    const dir = props.sort.field === field && props.sort.dir === "asc" ? "desc" : "asc";
    return buildHref(props.basePath, props.params, { sort: field, dir });
  };

  const groups = props.grouped
    ? props.statuses.map((status) => ({ status, rows: props.rows.filter((r) => r.status.id === status.id) })).filter((g) => g.rows.length > 0)
    : [{ status: null, rows: props.rows }];

  return (
    <table aria-label="Aufgaben" className="w-full table-fixed text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          {columns.map((col) => {
            const active = col.field && props.sort.field === col.field;
            return (
              <th
                key={col.label}
                scope="col"
                className={cn("px-2 py-2 font-medium", col.className)}
                aria-sort={active ? (props.sort.dir === "asc" ? "ascending" : "descending") : undefined}
              >
                {col.field ? (
                  <Link href={sortHref(col.field)} className={cn("inline-flex items-center gap-0.5 hover:text-foreground", active && "text-foreground")}>
                    {col.label}
                    {active && (props.sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </Link>
                ) : (
                  <span className={col.label === "Erledigt" ? "sr-only" : undefined}>{col.label}</span>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      {groups.map(({ status, rows }) => {
        const isCollapsed = !!status && collapsed.has(status.id);
        const heading = status && (
          <button
            type="button"
            aria-expanded={!isCollapsed}
            onClick={() =>
              setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(status.id)) next.delete(status.id);
                else next.add(status.id);
                return next;
              })
            }
            className="inline-flex items-center gap-2 rounded px-1 text-sm font-medium hover:bg-muted"
          >
            <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", !isCollapsed && "rotate-90")} aria-hidden />
            <span className="size-2 rounded-full" style={{ backgroundColor: status.color }} aria-hidden />
            {status.name}
            <span className="text-xs font-normal text-muted-foreground">{rows.length}</span>
          </button>
        );
        return (
          <tbody key={status?.id ?? "all"}>
            {status && (
              <tr className="bg-muted/30">
                {/* Hidden desktop columns must not create empty mobile columns via colspan. */}
                <th scope="colgroup" colSpan={3} className="px-2 py-1.5 text-left font-normal sm:hidden">{heading}</th>
                <th scope="colgroup" colSpan={columns.length} className="hidden px-2 py-1.5 text-left font-normal sm:table-cell">{heading}</th>
              </tr>
            )}
            {!isCollapsed &&
              rows.map((row) => {
                const done = doneOverride[row.id] ?? row.status.isDone;
                return (
                  <TaskRow
                    key={row.id}
                    row={row}
                    done={done}
                    grouped={props.grouped}
                    canEdit={props.canEdit}
                    today={props.today}
                    href={buildHref(props.basePath, props.params, { task: row.id })}
                    onToggle={(next) => toggleDone(row, next)}
                  />
                );
              })}
          </tbody>
        );
      })}
    </table>
  );
}

function TaskRow(props: {
  row: TaskListRow;
  done: boolean;
  grouped: boolean;
  canEdit: boolean;
  today: string;
  href: string;
  onToggle: (done: boolean) => void;
}) {
  const { row } = props;
  const overdue = !!row.dueDate && !props.done && row.dueDate < props.today;
  const dueToday = !!row.dueDate && !props.done && row.dueDate === props.today;
  return (
    <tr className="group border-b last:border-b-0 hover:bg-muted/40">
      <td className="px-2 py-2">
        <Checkbox
          checked={props.done}
          disabled={!props.canEdit}
          aria-label={`${row.key}-${row.number} ${row.title} ${props.done ? "wieder öffnen" : "erledigen"}`}
          onCheckedChange={props.onToggle}
          className="align-middle"
        />
      </td>
      <td className="hidden truncate px-2 py-2 text-xs text-muted-foreground tabular-nums sm:table-cell">{row.key}-{row.number}</td>
      <td className="px-2 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={props.href} scroll={false} className={cn("min-w-0 truncate font-medium hover:underline", props.done && "text-muted-foreground line-through")}>
            {row.title}
          </Link>
          {row.labels.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1 rounded-full border px-1.5 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: l.color }} />
              {l.name}
            </span>
          ))}
          {row.phase && <span className="text-[11px] text-muted-foreground">· {row.phase.name}</span>}
          <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
            {row.subtasks.total > 0 && (
              <span title="Unteraufgaben" className="inline-flex items-center gap-0.5"><GitBranch className="size-3" aria-hidden />{row.subtasks.done}/{row.subtasks.total}</span>
            )}
            {row.checklist.total > 0 && (
              <span title="Checkliste" className="inline-flex items-center gap-0.5"><CheckSquare className="size-3" aria-hidden />{row.checklist.done}/{row.checklist.total}</span>
            )}
            {row.commentCount > 0 && (
              <span title="Kommentare" className="inline-flex items-center gap-0.5"><MessageSquare className="size-3" aria-hidden />{row.commentCount}</span>
            )}
          </span>
        </div>
        {!props.grouped && (
          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.status.color }} />
            <span className="min-w-0 [overflow-wrap:anywhere]">{row.status.name}</span>
          </span>
        )}
      </td>
      {!props.grouped && (
        <td className="hidden px-2 py-2 sm:table-cell">
          <span className="inline-flex max-w-full items-center gap-1.5 text-xs">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.status.color }} />
            <span className="truncate">{row.status.name}</span>
          </span>
        </td>
      )}
      <td className="hidden px-2 py-2 sm:table-cell">
        {row.assignees.length === 0 ? (
          <span className="text-xs text-muted-foreground">–</span>
        ) : (
          <span className="flex -space-x-1.5" title={row.assignees.map((a) => a.name).join(", ")}>
            {row.assignees.slice(0, 3).map((a) => (
              <span key={a.id} className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium">
                {initials(a.name)}
              </span>
            ))}
            <span className="sr-only">{row.assignees.map((a) => a.name).join(", ")}</span>
          </span>
        )}
      </td>
      <td className="hidden px-2 py-2 sm:table-cell"><PriorityBadge priority={row.priority} /></td>
      <td className={cn("px-2 py-2 text-xs tabular-nums", overdue ? "font-medium text-destructive" : dueToday ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
        {row.dueDate ? formatDate(row.dueDate) : "–"}
        {overdue && <span className="sr-only"> (überfällig)</span>}
        {dueToday && <span className="sr-only"> (heute)</span>}
      </td>
    </tr>
  );
}
