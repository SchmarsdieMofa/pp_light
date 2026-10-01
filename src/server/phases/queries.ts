import { eq } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { phases } from "@/server/db/schema";

export type Phase = typeof phases.$inferSelect;

export function listPhases(ex: Executor, projectId: string): Promise<Phase[]> {
  return ex.select().from(phases).where(eq(phases.projectId, projectId)).orderBy(byPosition(phases.position));
}
