import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runAction } from "@/server/action-result";
import { DomainError } from "@/server/errors";

describe("runAction", () => {
  it("wraps the result", async () => {
    expect(await runAction(async () => 42)).toEqual({ ok: true, data: 42 });
  });

  it("maps zod errors to VALIDATION with field errors", async () => {
    const res = await runAction(async () => z.object({ key: z.string().min(2, "zu kurz") }).parse({ key: "a" }));
    expect(res).toEqual({
      ok: false,
      error: { code: "VALIDATION", message: "Bitte Eingaben prüfen.", fieldErrors: { key: ["zu kurz"] } },
    });
  });

  it("passes domain errors through", async () => {
    const res = await runAction(async () => {
      throw new DomainError("KEY_TAKEN", "vergeben");
    });
    expect(res).toEqual({ ok: false, error: { code: "KEY_TAKEN", message: "vergeben" } });
  });

  it("hides unexpected errors behind INTERNAL and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runAction(async () => {
      throw new Error("db down: password=secret");
    });
    expect(res).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "Unerwarteter Fehler – bitte erneut versuchen." },
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
