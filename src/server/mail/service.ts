import { createMailTransport } from "./transport";

export async function sendMail(to: string, subject: string, body: string): Promise<void> {
  const transport = createMailTransport();
  await transport.sendMail({ from: process.env.SMTP_FROM ?? "pp_light <no-reply@localhost>", to, subject, text: body });
}
