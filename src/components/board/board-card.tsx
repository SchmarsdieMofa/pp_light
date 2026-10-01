import Link from "next/link";
import { DueDate, LabelChips, PriorityBadge } from "@/components/tasks/task-badges";
import type { CardDensity } from "@/lib/enums";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import type { TaskListRow } from "@/server/tasks/queries";

export function BoardCard({
  card,
  density,
  href,
  dragging,
}: {
  card: TaskListRow;
  density: CardDensity;
  href: string;
  dragging?: boolean;
}) {
  const showDetails = density !== "compact";
  return (
    <Link
      href={href}
      draggable={false}
      className={cn(
        "block space-y-1 rounded-md border bg-background p-2 text-sm shadow-xs hover:border-primary/40",
        dragging && "opacity-40",
      )}
    >
      {showDetails && (
        <span className="flex items-center justify-between text-xs text-muted-foreground">
          {card.key}-{card.number}
          <PriorityBadge priority={card.priority} />
        </span>
      )}
      <span className="block">{card.title}</span>
      {density === "full" && card.descriptionExcerpt && (
        <span className="line-clamp-2 block text-xs text-muted-foreground">{card.descriptionExcerpt}</span>
      )}
      {density === "full" && card.phase && (
        <span className="block text-xs text-muted-foreground">Phase: {card.phase.name}</span>
      )}
      {showDetails && card.labels.length > 0 && <LabelChips labels={card.labels} />}
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {card.dueDate && <DueDate date={card.dueDate} isDone={card.status.isDone} />}
        {showDetails && card.subtasks.total > 0 && (
          <span title="Unteraufgaben">
            ▣ {card.subtasks.done}/{card.subtasks.total}
          </span>
        )}
        {showDetails && card.checklist.total > 0 && (
          <span title="Checkliste">
            ☑ {card.checklist.done}/{card.checklist.total}
          </span>
        )}
        {showDetails && card.commentCount > 0 && <span title="Kommentare">◌ {card.commentCount}</span>}
        <span className="ml-auto flex -space-x-1">
          {card.assignees.map((a) => (
            <span
              key={a.id}
              title={a.name}
              className="inline-flex size-5 items-center justify-center rounded-full border bg-muted text-[10px] font-medium text-foreground"
            >
              {initials(a.name)}
            </span>
          ))}
        </span>
      </span>
    </Link>
  );
}
