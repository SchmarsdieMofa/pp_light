export type ErrorCode =
  | "VALIDATION"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "KEY_TAKEN"
  | "EMAIL_TAKEN"
  | "CONFLICT";

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Postgres unique_violation (23505); Drizzle wraps driver errors in `cause`. */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === "object" && current !== null && "code" in current && current.code === "23505") {
      return true;
    }
    current = typeof current === "object" && current !== null && "cause" in current ? current.cause : undefined;
  }
  return false;
}
