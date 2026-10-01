import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "E-Mail fehlt"),
  password: z.string().min(1, "Passwort fehlt"),
});
