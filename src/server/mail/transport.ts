import { readFileSync } from "node:fs";
import { getCACertificates, type ConnectionOptions, type SecureVersion } from "node:tls";
// Auth.js declares an optional peer dependency capped at Nodemailer 8.
import nodemailer, { type SMTPTransportOptions } from "nodemailer10";

const tlsModes = ["auto", "starttls", "required", "ssl", "none"] as const;
const tlsVersions: SecureVersion[] = ["TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"];

export function buildMailOptions(env: Record<string, string | undefined> = process.env): SMTPTransportOptions {
  // Keep existing deployments working; an explicit new mode takes precedence.
  const mode = env.SMTP_TLS_MODE || (env.SMTP_SECURE === "true" ? "ssl" : "auto");
  if (!tlsModes.some((value) => value === mode)) {
    throw new Error(`SMTP_TLS_MODE ungültig: ${mode}. Erlaubt: ${tlsModes.join(", ")}.`);
  }
  const reject = env.SMTP_TLS_REJECT_UNAUTHORIZED || "true";
  if (reject !== "true" && reject !== "false") {
    throw new Error("SMTP_TLS_REJECT_UNAUTHORIZED muss true oder false sein.");
  }
  const minVersion = env.SMTP_TLS_MIN_VERSION || "TLSv1.2";
  if (!tlsVersions.some((value) => value === minVersion)) {
    throw new Error(`SMTP_TLS_MIN_VERSION ungültig: ${minVersion}. Erlaubt: ${tlsVersions.join(", ")}.`);
  }
  const port = Number(env.SMTP_PORT || 1025);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT muss eine ganze Zahl zwischen 1 und 65535 sein.");
  }
  const tls: ConnectionOptions = { rejectUnauthorized: reject === "true", minVersion: minVersion as SecureVersion };
  if (env.SMTP_TLS_CIPHERS) tls.ciphers = env.SMTP_TLS_CIPHERS;
  if (env.SMTP_TLS_CA_FILE) {
    try {
      // Add the internal CA while retaining the runtime's normal trust store.
      tls.ca = [...getCACertificates("default"), readFileSync(env.SMTP_TLS_CA_FILE, "utf8")];
    } catch (error) {
      throw new Error("SMTP_TLS_CA_FILE konnte nicht gelesen werden.", { cause: error });
    }
  }
  return {
    host: env.SMTP_HOST,
    port,
    secure: mode === "ssl",
    ignoreTLS: mode === "none",
    requireTLS: mode === "required" || mode === "starttls",
    tls,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? env.SMTP_PASS ?? "" } : undefined,
  };
}

export function validateMailConfiguration(env: Record<string, string | undefined> = process.env): void {
  const options = buildMailOptions(env);
  if (options.ignoreTLS) console.warn("WARN: SMTP ohne TLS-Verschlüsselung (SMTP_TLS_MODE=none) – nur in vertrauenswürdigen internen Netzen verwenden.");
  if (options.tls?.rejectUnauthorized === false) console.warn("WARN: SMTP-Zertifikatsprüfung deaktiviert (SMTP_TLS_REJECT_UNAUTHORIZED=false).");
}

export function createMailTransport(env: Record<string, string | undefined> = process.env) {
  if (!env.SMTP_HOST) throw new Error("SMTP_HOST fehlt; E-Mail bleibt zum erneuten Versand vorgemerkt.");
  return nodemailer.createTransport(buildMailOptions(env));
}
