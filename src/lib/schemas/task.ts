import { z } from "zod";
import { isPlausibleDate } from "@/lib/dates";
import { TASK_PRIORITIES } from "@/lib/enums";
import { LABEL_COLORS } from "@/lib/labels";

const title = z.string().trim().min(1, "Titel fehlt").max(200, "Höchstens 200 Zeichen");
const isoDate = z.iso.date("Ungültiges Datum").refine(isPlausibleDate, "Bitte ein Jahr zwischen 1900 und 2999 angeben.");

export const createTaskSchema = z.object({
  projectId: z.uuid(),
  title,
  parentId: z.uuid().optional(),
  statusId: z.uuid().optional(),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title,
    description: z.string().max(20000, "Höchstens 20000 Zeichen"),
    statusId: z.uuid(),
    priority: z.enum(TASK_PRIORITIES),
    startDate: isoDate.nullable(),
    dueDate: isoDate.nullable(),
  })
  .partial();
export type TaskPatch = z.input<typeof updateTaskSchema>;

const colorValues = LABEL_COLORS.map((c) => c.value) as [string, ...string[]];

export const labelSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "Name fehlt").max(40, "Höchstens 40 Zeichen"),
  color: z.enum(colorValues, "Unbekannte Farbe"),
});
export type LabelInput = z.input<typeof labelSchema>;

export const checklistTextSchema = z.string().trim().min(1, "Text fehlt").max(300, "Höchstens 300 Zeichen");
