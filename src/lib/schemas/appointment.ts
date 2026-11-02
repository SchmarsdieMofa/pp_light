import { TZDate } from "@date-fns/tz";
import { z } from "zod";
import { APP_TIME_ZONE } from "@/lib/dates";

export function appointmentLocalTime(value: Date | string): string {
  const date = new TZDate(new Date(value), APP_TIME_ZONE);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local values always refer to the team's zone, including on a UTC server. */
export function appointmentInstant(value: string): Date {
  const [year, month, day, hour, minute] = value.split(/[-T:]/).map(Number);
  return new Date(new TZDate(year, month - 1, day, hour, minute, 0, APP_TIME_ZONE).getTime());
}

const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Bitte Datum und Uhrzeit angeben.")
  .refine((value) => {
    const date = appointmentInstant(value);
    return Number.isFinite(date.getTime()) && appointmentLocalTime(date) === value && Number(value.slice(0, 4)) >= 1900;
  }, "Dieses Datum oder diese Uhrzeit existiert nicht.");

export const appointmentSchema = z.object({
  projectId: z.uuid(),
  taskId: z.uuid().nullable().default(null),
  personal: z.boolean().default(false),
  title: z.string().trim().min(1, "Bitte einen Titel eingeben.").max(200),
  startsAt: localTime,
  endsAt: localTime,
  location: z.string().trim().max(500).default(""),
}).refine((input) => !input.personal || !!input.taskId, { message: "Bitte eine eigene Aufgabe auswählen.", path: ["taskId"] })
  .refine((input) => appointmentInstant(input.endsAt) > appointmentInstant(input.startsAt), {
  message: "Das Ende muss nach dem Beginn liegen.", path: ["endsAt"],
});

export type AppointmentInput = z.input<typeof appointmentSchema>;
