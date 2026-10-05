import { lookup } from "node:dns/promises";
import { TLSSocket } from "node:tls";
import SMTPConnection from "nodemailer10/lib/smtp-connection";
import nodemailer, { type SMTPTransportOptions } from "nodemailer10";
import { buildMailOptions, validateMailConfiguration } from "./transport";

async function probe(options: SMTPTransportOptions, log: (message: string) => void): Promise<void> {
  const connection = new SMTPConnection(options);
  try {
    await new Promise<void>((resolve, reject) => {
      connection.once("error", reject);
      connection.once("end", () => reject(new Error("SMTP-Verbindung vorzeitig geschlossen.")));
      connection.connect((error) => error ? reject(error) : resolve());
    });
    const socket = connection._socket;
    if (!socket) throw new Error("SMTP-Verbindung hat keinen Socket.");
    log(`Erreichbar: ${socket.remoteAddress}:${socket.remotePort}`);
    const ehlo = connection.lastServerResponse || "Keine EHLO-Antwort";
    log(`EHLO-Capabilities:\n${ehlo}`);
    if (!(socket instanceof TLSSocket)) {
      log(`STARTTLS angeboten: ${/[ -]STARTTLS\b/im.test(ehlo) ? "ja" : "nein"}`);
      log("Verbindung unverschlüsselt.");
      return;
    }
    log(`TLS-Protokoll: ${socket.getProtocol()}`);
    log(`Ciphersuite: ${JSON.stringify(socket.getCipher())}`);
    log(`Ephemerer Schlüssel (DH-Bitlänge): ${JSON.stringify(socket.getEphemeralKeyInfo())}`);
    const certificate = socket.getPeerCertificate();
    log(`Zertifikat Subject: ${JSON.stringify(certificate.subject)}`);
    log(`Zertifikat Issuer: ${JSON.stringify(certificate.issuer)}`);
    log(`Zertifikat notAfter: ${certificate.valid_to}`);
    log(`Ketten-/Hostnamenprüfung: ${socket.authorized ? "OK" : String(socket.authorizationError)}`);
  } finally {
    connection.close();
  }
}

export async function checkSmtp(env: Record<string, string | undefined> = process.env, log: (message: string) => void = console.info): Promise<void> {
  validateMailConfiguration(env);
  if (!env.SMTP_HOST) throw new Error("SMTP_HOST fehlt.");
  const options = {
    ...buildMailOptions(env), connectionTimeout: 10_000, greetingTimeout: 10_000,
    socketTimeout: 10_000, dnsTimeout: 10_000,
  };
  log(`SMTP-Ziel: ${options.host}:${options.port}`);
  try {
    log(`DNS: ${JSON.stringify(await lookup(env.SMTP_HOST, { all: true }))}`);
    if (!options.secure) {
      // Observe the original EHLO before STARTTLS hides the pre-TLS capabilities.
      await probe({ ...options, auth: undefined, ignoreTLS: true, requireTLS: false }, log);
    }
    if (!options.ignoreTLS) {
      log("TLS-Diagnose: Zertifikate werden nur zur Inspektion akzeptiert; keine Anmeldung, kein Versand. verify() prüft anschließend die tatsächliche Konfiguration.");
      await probe({ ...options, auth: undefined, tls: { ...options.tls, rejectUnauthorized: false } }, log);
    }
  } catch (error) {
    log(`Diagnose fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
  }
  const transport = nodemailer.createTransport(options);
  try {
    await transport.verify();
    log("transporter.verify(): OK (Verbindung und ggf. Anmeldung; keine Mail versendet).");
  } finally {
    transport.close();
  }
}
