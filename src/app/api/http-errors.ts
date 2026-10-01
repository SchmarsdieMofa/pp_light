import { NextResponse } from "next/server";
import { DomainError } from "@/server/errors";

const STATUS: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, VALIDATION: 400, TOO_LARGE: 413 };

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Maps domain errors to HTTP; anything unexpected is logged and hidden behind a 500. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof DomainError) return jsonError(STATUS[err.code] ?? 400, err.message);
  console.error(err);
  return jsonError(500, "Unerwarteter Fehler");
}
