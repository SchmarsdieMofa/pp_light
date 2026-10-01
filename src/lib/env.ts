import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z
    .string()
    .min(32, "mindestens 32 Zeichen")
    .refine((v) => !v.startsWith("change-me"), "Platzhalter aus .env.example – bitte zufällig erzeugen"),
  APP_URL: z.string().min(1).default("http://localhost:3000"),
  UPLOAD_MAX_MB: z.coerce.number().int().positive().default(25),
  UPLOAD_DIR: z.string().min(1).default("./data/uploads"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Ungültige Konfiguration – ${details}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
