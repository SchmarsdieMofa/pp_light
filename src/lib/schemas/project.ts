import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(100, "Höchstens 100 Zeichen"),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, "2–10 Zeichen, nur Buchstaben/Ziffern, beginnt mit einem Buchstaben"),
  description: z.string().trim().max(2000, "Höchstens 2000 Zeichen").optional().default(""),
});

export type CreateProjectInput = z.input<typeof createProjectSchema>;
