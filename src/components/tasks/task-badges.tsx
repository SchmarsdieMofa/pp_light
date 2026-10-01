import { formatDate, isOverdue } from "@/lib/dates";
import type { TaskPriority } from "@/lib/enums";
import { PRIORITY_LABELS } from "@/lib/priority";
import { cn } from "@/lib/utils";

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  none: "text-muted-foreground",
  low: "text-sky-600 dark:text-sky-400",
  med: "text-amber-600 dark:text-amber-400",
  high: "text-orange-600 dark:text-orange-400",
  urgent: "text-red-600 dark:text-red-400 font-medium",
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (priority === "none") return <span className="text-muted-foreground">–</span>;
  return <span className={cn("text-xs", PRIORITY_STYLE[priority])}>{PRIORITY_LABELS[priority]}</span>;
}

export function LabelChips({ labels }: { labels: { id: string; name: string; color: string }[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span key={l.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
          <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
          {l.name}
        </span>
      ))}
    </span>
  );
}

export function DueDate({ date, isDone }: { date: string | null; isDone: boolean }) {
  if (!date) return <span className="text-muted-foreground">–</span>;
  const overdue = isOverdue(date, isDone);
  return (
    <span className={cn("text-xs", overdue && "font-medium text-destructive")}>
      {formatDate(date)}
      {overdue && <span className="sr-only"> (überfällig)</span>}
    </span>
  );
}
