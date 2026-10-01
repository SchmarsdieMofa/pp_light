"use server";

import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { searchEverything, type SearchResult } from "@/server/search/service";

export async function searchAction(query: string): Promise<SearchResult> {
  const actor = await requireActor();
  return searchEverything(db(), actor, String(query ?? ""));
}
