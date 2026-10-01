import Link from "next/link";
import type { TaskSort, TaskSortField } from "@/lib/task-list-params";
import { buildHref, type SearchParams } from "@/lib/urls";
import type { TaskListRow } from "@/server/tasks/queries";
import { DueDate, LabelChips, PriorityBadge } from "./task-badges";

const COLUMNS: { field?: TaskSortField; label: string }[] = [
  { field: "number", label: "Nr." },
  { field: "title", label: "Titel" },
  { field: "status", label: "Status" },
  { field: "priority", label: "Priorität" },
  { label: "Zuständig" },
  { label: "Labels" },
  { field: "dueDate", label: "Fällig" },
  { label: "Fortschritt" },
];

export function TaskTable(props: { rows: TaskListRow[]; sort: TaskSort; basePath: string; params: SearchParams }) {
  const sortHref = (field: TaskSortField) => {
    const dir = props.sort.field === field && props.sort.dir === "asc" ? "desc" : "asc";
    return buildHref(props.basePath, props.params, { sort: field, dir });
  };
  return (
    <table aria-label="Aufgaben" className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          {COLUMNS.map((col) => (
            <th
              key={col.label}
              className="px-2 py-2 font-medium"
              aria-sort={
                col.field && props.sort.field === col.field ? (props.sort.dir === "asc" ? "ascending" : "descending") : undefined
              }
            >
              {col.field ? <Link href={sortHref(col.field)}>{col.label}</Link> : col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={row.id} className="border-b hover:bg-muted/40">
            <td className="px-2 py-2 text-xs whitespace-nowrap text-muted-foreground">
              {row.key}-{row.number}
            </td>
            <td className="px-2 py-2">
              <Link href={buildHref(props.basePath, props.params, { task: row.id })} className="hover:underline">
                {row.title}
              </Link>
            </td>
            <td className="px-2 py-2 whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="size-2 rounded-full" style={{ backgroundColor: row.status.color }} />
                {row.status.name}
              </span>
            </td>
            <td className="px-2 py-2">
              <PriorityBadge priority={row.priority} />
            </td>
            <td className="px-2 py-2 text-xs">{row.assignees.map((a) => a.name).join(", ") || "–"}</td>
            <td className="px-2 py-2">
              <LabelChips labels={row.labels} />
            </td>
            <td className="px-2 py-2 whitespace-nowrap">
              <DueDate date={row.dueDate} isDone={row.status.isDone} />
            </td>
            <td className="px-2 py-2 text-xs whitespace-nowrap text-muted-foreground">
              {row.subtasks.total > 0 && <span title="Unteraufgaben">▣ {row.subtasks.done}/{row.subtasks.total} </span>}
              {row.checklist.total > 0 && <span title="Checkliste">☑ {row.checklist.done}/{row.checklist.total}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
