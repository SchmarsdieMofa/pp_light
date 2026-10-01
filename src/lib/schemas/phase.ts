import { z } from "zod";
import { isPlausibleDate } from "@/lib/dates";

const date = z.iso.date("Ungültiges Datum").refine(isPlausibleDate, "Bitte ein Jahr zwischen 1900 und 2999 angeben.").nullable();

export const phaseSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(80, "Höchstens 80 Zeichen"),
  startDate: date,
  endDate: date,
  isMilestone: z.boolean(),
}).superRefine((phase, context) => {
  if (phase.startDate && phase.endDate && phase.startDate > phase.endDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "Das Ende liegt vor dem Start." });
  }
  if (phase.isMilestone && (!phase.startDate || phase.startDate !== phase.endDate)) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "Ein Meilenstein braucht genau ein Datum." });
  }
});

export type PhaseInput = z.input<typeof phaseSchema>;
