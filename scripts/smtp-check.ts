import { checkSmtp } from "../src/server/mail/diagnostics";

void checkSmtp().catch((error: unknown) => {
  console.error("SMTP-Prüfung fehlgeschlagen:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
