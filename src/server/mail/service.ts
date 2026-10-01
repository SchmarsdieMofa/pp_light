// Auth.js declares an optional peer dependency capped at Nodemailer 8.
import nodemailer from "nodemailer10";

export async function sendMail(to: string, subject: string, body: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("SMTP_HOST fehlt; E-Mail bleibt zum erneuten Versand vorgemerkt.");
  const transport = nodemailer.createTransport({
    host, port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM ?? "pp_light <no-reply@localhost>", to, subject, text: body });
}
