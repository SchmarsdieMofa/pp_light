import { ZodError, z } from "zod";
import { DomainError } from "./errors";

export type ActionError = { code: string; message: string; fieldErrors?: Record<string, string[]> };
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false,
        error: {
          code: "VALIDATION",
          message: "Bitte Eingaben prüfen.",
          fieldErrors: z.flattenError(err).fieldErrors as Record<string, string[]>,
        },
      };
    }
    if (err instanceof DomainError) {
      return { ok: false, error: { code: err.code, message: err.message } };
    }
    console.error(err);
    return { ok: false, error: { code: "INTERNAL", message: "Unerwarteter Fehler – bitte erneut versuchen." } };
  }
}
