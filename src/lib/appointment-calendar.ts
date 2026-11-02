import { addDays, todayInZone } from "@/lib/dates";
import { appointmentLocalTime } from "@/lib/schemas/appointment";
import type { AppointmentRow } from "@/server/appointments/service";
import type { CalendarTask } from "@/server/calendar/service";

/** Split spanning appointments across their calendar days; an end at midnight excludes that day. */
export function appointmentCalendarEntries(rows: AppointmentRow[], from: string, to: string): CalendarTask[] {
  return rows.flatMap((entry) => {
    const start = appointmentLocalTime(entry.startsAt);
    const end = appointmentLocalTime(entry.endsAt);
    const last = todayInZone(new Date(new Date(entry.endsAt).getTime() - 1));
    const days: CalendarTask[] = [];
    for (let day = start.slice(0, 10) < from ? from : start.slice(0, 10); day <= last && day <= to; day = addDays(day, 1)) {
      days.push({
        id: `${entry.id}:${day}`, appointmentHref: `/projects/${entry.projectId}/appointments#${entry.id}`,
        appointmentPersonal: entry.isPersonal,
        projectId: entry.projectId, projectName: entry.projectName, key: entry.key, path: entry.taskPath ?? "",
        title: `${day === start.slice(0, 10) ? start.slice(11) : "↳"} ${entry.title}`, dueDate: day,
        statusName: `${start.slice(11)} – ${end.slice(11)}`, isDone: false, priority: "none", updatedAt: entry.startsAt,
        canEdit: false,
      });
    }
    return days;
  });
}
