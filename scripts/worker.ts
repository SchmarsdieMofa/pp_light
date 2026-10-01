import { PgBoss } from "pg-boss";
import { createDb } from "../src/server/db/client";
import { sendPendingDigests, sendPendingOutbox } from "../src/server/notifications/digest";
import { createDueReminders } from "../src/server/notifications/service";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL fehlt.");
  const db = createDb(url);
  const boss = new PgBoss(url);
  boss.on("error", (error) => console.error("pg-boss:", error));

  const queues = ["mail-outbox", "notification-digest", "due-reminders"] as const;
  await boss.start();
  for (const name of queues) await boss.createQueue(name, { retryLimit: 2, retryDelay: 60, retryBackoff: true });
  await boss.schedule("mail-outbox", "* * * * *");
  await boss.schedule("notification-digest", "* * * * *");
  await boss.schedule("due-reminders", "0 8 * * *", null, { tz: "Europe/Berlin", missed: "once" });

  const work = async (name: typeof queues[number], run: () => Promise<unknown>) => {
    await boss.work(name, async (jobs) => {
      try { await run(); }
      catch (error) {
        if (jobs[0]?.retryCount >= 2) console.error(`Job ${name} failed permanently:`, error);
        throw error;
      }
    });
  };
  await work("mail-outbox", () => sendPendingOutbox(db));
  await work("notification-digest", () => sendPendingDigests(db));
  await work("due-reminders", () => createDueReminders(db));

  const stop = async () => { await boss.stop(); await db.$client.end(); process.exit(0); };
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
  console.info("M7 worker started");
}

void main().catch((error) => { console.error("Worker startup failed:", error); process.exitCode = 1; });
