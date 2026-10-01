import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  DATABASE_URL: "postgres://pp:pp@localhost:5432/pp_light",
  AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.UPLOAD_MAX_MB).toBe(25);
  });

  it("coerces numbers", () => {
    expect(parseEnv({ ...valid, UPLOAD_MAX_MB: "50" }).UPLOAD_MAX_MB).toBe(50);
  });

  it("names the missing variable", () => {
    expect(() => parseEnv({ AUTH_SECRET: valid.AUTH_SECRET })).toThrow(/DATABASE_URL/);
  });

  it("rejects a short AUTH_SECRET", () => {
    expect(() => parseEnv({ ...valid, AUTH_SECRET: "kurz" })).toThrow(/AUTH_SECRET/);
  });

  it("rejects the placeholder AUTH_SECRET from .env.example", () => {
    expect(() =>
      parseEnv({ ...valid, AUTH_SECRET: "change-me-to-a-random-string-with-at-least-32-chars" }),
    ).toThrow(/AUTH_SECRET/);
  });
});
