"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { addDependencyAction, removeDependencyAction, updateDependencyLagAction } from "@/app/(app)/tasks/actions";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/action-result";
import type { TaskLink } from "@/server/dependencies/queries";
import type { TaskDetail } from "@/server/tasks/queries";
import { useTaskHref } from "./use-task-href";

const selectClass = "h-8 rounded-md border bg-background px-2 text-sm";
const movedCountKey = "pp-light:dependency-moved-count";

function useRun() {
  const [pending, startTransition] = useTransition();
  function run<T>(action: () => Promise<ActionResult<T>>, onOk?: (data: T) => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error.fieldErrors ? Object.values(result.error.fieldErrors).flat()[0] : result.error.message);
        return;
      }
      onOk?.(result.data);
    });
  }
  return { pending, run };
}

function movedMessage(count: number) {
  if (count === 0) return;
  sessionStorage.setItem(movedCountKey, String(count));
  window.location.reload();
}

export function TaskDependencies({ detail }: { detail: TaskDetail }) {
  const href = useTaskHref();
  useEffect(() => {
    const count = Number(sessionStorage.getItem(movedCountKey));
    sessionStorage.removeItem(movedCountKey);
    if (count > 0) toast.success(`${count} ${count === 1 ? "Aufgabe" : "Aufgaben"} verschoben`);
  }, []);
  return (
    <section className="space-y-3 border-t pt-4">
      <h2 className="text-sm font-medium">Abhängigkeiten</h2>
      {(!detail.startDate || !detail.dueDate) && (
        <p className="text-xs text-muted-foreground">Automatisches Verschieben braucht Start und Fälligkeit der Aufgabe.</p>
      )}
      <DependencyList detail={detail} title="Blockiert durch" links={detail.blockers} isBlockerList href={href} />
      <DependencyList detail={detail} title="Blockiert" links={detail.successors} isBlockerList={false} href={href} />
    </section>
  );
}

function DependencyList(props: {
  detail: TaskDetail;
  title: string;
  links: TaskLink[];
  isBlockerList: boolean;
  href: (id: string) => string;
}) {
  const [selected, setSelected] = useState("");
  const [lag, setLag] = useState(0);
  const { pending, run } = useRun();
  const blockerId = props.isBlockerList ? selected : props.detail.id;
  const blockedId = props.isBlockerList ? props.detail.id : selected;
  const available = props.detail.taskOptions.filter((option) => !props.links.some((link) => link.id === option.id));
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">{props.title}</h3>
      {props.links.length === 0 && !(props.detail.canEdit && available.length > 0) && <p className="text-xs text-muted-foreground">Keine</p>}
      <ul className="space-y-1">
        {props.links.map((link) => (
          <DependencyRow key={link.id} detail={props.detail} link={link} isBlockerList={props.isBlockerList} href={props.href} />
        ))}
      </ul>
      {props.detail.canEdit && available.length > 0 && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => {
          event.preventDefault();
          if (!selected) return;
          run(() => addDependencyAction(blockerId, blockedId, lag), (result) => {
            setSelected(""); setLag(0); movedMessage(result.movedCount);
          });
        }}>
          <select aria-label={props.isBlockerList ? "Blocker hinzufügen" : "Nachfolger hinzufügen"}
            className={`${selectClass} w-full`} value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="">Aufgabe wählen…</option>
            {available.map((option) => <option key={option.id} value={option.id}>
              {props.detail.key}-{option.number} {option.title}
            </option>)}
          </select>
          {/* Lag and submit only matter once a task is picked. */}
          {selected && (
            <>
              <label className="flex items-center gap-1 text-xs">Abstand
                <input aria-label={`Abstand für ${props.title}`} type="number" min={0} max={3650} className={`${selectClass} w-16`}
                  value={lag} onChange={(event) => setLag(Number(event.target.value))} />
              </label>
              <Button type="submit" size="sm" disabled={pending}>Hinzufügen</Button>
            </>
          )}
        </form>
      )}
    </div>
  );
}

function DependencyRow(props: { detail: TaskDetail; link: TaskLink; isBlockerList: boolean; href: (id: string) => string }) {
  const [lag, setLag] = useState(props.link.lagDays);
  const { pending, run } = useRun();
  const blockerId = props.isBlockerList ? props.link.id : props.detail.id;
  const blockedId = props.isBlockerList ? props.detail.id : props.link.id;
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs">
      <Link href={props.href(props.link.id)} className="hover:underline">
        {props.detail.key}-{props.link.number} {props.link.title}
      </Link>
      {props.detail.canEdit ? (
        <>
          <label className="ml-auto flex items-center gap-1">Abstand
            <input type="number" min={0} max={3650} aria-label={`Abstand zu ${props.link.title}`}
              className={`${selectClass} w-16`} value={lag} disabled={pending}
              onChange={(event) => setLag(Number(event.target.value))} />
          </label>
          {lag !== props.link.lagDays && (
            <Button type="button" size="sm" variant="secondary" disabled={pending}
              onClick={() => run(() => updateDependencyLagAction(blockerId, blockedId, lag), (result) => movedMessage(result.movedCount))}>
              Abstand speichern
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" disabled={pending}
            onClick={() => run(() => removeDependencyAction(blockerId, blockedId))}>Entfernen</Button>
        </>
      ) : <span className="ml-auto text-muted-foreground">+{props.link.lagDays} Arbeitstage</span>}
    </li>
  );
}
