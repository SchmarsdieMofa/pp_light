import { format, isSameMonth, isSameYear, subMilliseconds } from "date-fns";
import type { GanttI18nOverrides } from "@/components/reui/gantt/gantt-i18n";

/** German labels and date formats for the ReUI gantt; the date-fns `de` locale handles month and day names. */
export const ganttI18nDe: GanttI18nOverrides = {
  labels: {
    today: "Heute",
    previous: "Zurück",
    next: "Weiter",
    addEvent: "Termin hinzufügen",
    addTask: "Aufgabe hinzufügen",
    allDay: "Ganztägig",
    loading: "Zeitplan wird geladen",
    event: "Termin",
    events: (count) => (count === 1 ? "1 Termin" : `${count} Termine`),
    week: (weekNumber) => `KW ${weekNumber}`,
    resources: "Aufgabe",
    goToDate: "Zu Datum springen",
    scheduleHint: "Zum Planen klicken",
    scheduleHintDrag: "Klicken oder ziehen zum Planen",
    reorder: "Neu anordnen",
    selectView: "Ansicht wählen",
    zoomIn: "Vergrößern",
    zoomOut: "Verkleinern",
    resizePanel: "Spaltenbreite ändern",
    jumpToBar: (title) => `Zu „${title}“ scrollen`,
    progress: (percent) => `${percent} % erledigt`,
    durationDays: (days) => (days === 1 ? "1 Tag" : `${days} Tage`),
    continues: "geht weiter",
    planned: (rangeLabel) => `Geplant ${rangeLabel}`,
    milestone: "Meilenstein",
    scales: { day: "Tag", week: "Woche", month: "Monat", quarter: "Quartal", year: "Jahr" },
  },
  formats: { monthTitle: "MMMM yyyy", dayTitle: "EEEE, d. MMMM yyyy", timeGutter: "HH", eventTime: "HH:mm",
    axisDay: "d. MMM", axisDayOfMonth: "d.", fullDate: "d. MMM yyyy" },
  functions: {
    formatTitle: (scale, { date, activeRange, locale }) => {
      const opts = { locale };
      if (scale === "day") return format(date, "EEEE, d. MMMM yyyy", opts);
      if (scale === "month") return format(date, "MMMM yyyy", opts);
      if (scale === "quarter") return format(date, "QQQ yyyy", opts);
      if (scale === "year") return format(date, "yyyy", opts);
      const start = activeRange.start;
      const end = subMilliseconds(activeRange.end, 1);
      if (isSameMonth(start, end)) return `${format(start, "d.", opts)}–${format(end, "d. MMMM yyyy", opts)}`;
      if (isSameYear(start, end)) return `${format(start, "d. MMM", opts)} – ${format(end, "d. MMM yyyy", opts)}`;
      return `${format(start, "d. MMM yyyy", opts)} – ${format(end, "d. MMM yyyy", opts)}`;
    },
    formatEventTime: (start, end, _allDay, locale) => {
      const opts = { locale };
      const last = end.getTime() > start.getTime() ? subMilliseconds(end, 1) : start;
      if (format(start, "yyyy-MM-dd") === format(last, "yyyy-MM-dd")) return format(start, "d. MMM yyyy", opts);
      return `${format(start, "d. MMM", opts)} – ${format(last, "d. MMM yyyy", opts)}`;
    },
    formatDayRange: (range, locale) =>
      `${format(range.start, "d. MMM", { locale })} – ${format(subMilliseconds(range.end, 1), "d. MMM", { locale })}`,
  },
};
