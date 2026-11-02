"use server";

import { revalidatePath } from "next/cache";
import type { AppointmentInput } from "@/lib/schemas/appointment";
import { runAction } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { deleteAppointment, saveAppointment } from "@/server/appointments/service";
import { db } from "@/server/db/client";

export async function saveAppointmentAction(input: AppointmentInput, id?: string) {
  const actor = await requireActor();
  return runAction(async () => {
    await saveAppointment(db(), actor, input, id);
    revalidatePath("/", "layout");
  });
}

export async function deleteAppointmentAction(id: string) {
  const actor = await requireActor();
  return runAction(async () => {
    await deleteAppointment(db(), actor, id);
    revalidatePath("/", "layout");
  });
}
