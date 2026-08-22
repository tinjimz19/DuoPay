"use server";

import { createClient } from "@/lib/supabase/server";
import { grantSubscriptionDays } from "@/lib/admin-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { zodMessage, type ActionResult } from "@/lib/validation";

const TRIAL_DAYS = 3;

const storeActionSchema = z.object({
  profileId: z.string().uuid(),
});

async function requireSuperAdmin() {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "super_admin") return null;

  return { supabase, userId: user.id };
}

function addDays(base: Date, days: number) {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export async function activateStore(
  input: z.infer<typeof storeActionSchema>
): Promise<ActionResult> {
  const parsedInput = storeActionSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: zodMessage(parsedInput.error) };
  }
  const parsed = parsedInput.data;
  const context = await requireSuperAdmin();
  if (!context) {
    return { success: false, error: "No autorizado" };
  }
  const { supabase } = context;

  const { error } = await grantSubscriptionDays(supabase, parsed.profileId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/tiendas");
  revalidatePath("/admin/pagos");
  return { success: true };
}

export async function suspendStore(
  input: z.infer<typeof storeActionSchema>
): Promise<ActionResult> {
  const parsedInput = storeActionSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: zodMessage(parsedInput.error) };
  }
  const parsed = parsedInput.data;
  const context = await requireSuperAdmin();
  if (!context) {
    return { success: false, error: "No autorizado" };
  }
  const { supabase } = context;

  const { error } = await supabase
    .from("profiles")
    .update({ status: "SUSPENDED" })
    .eq("id", parsed.profileId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/tiendas");
  return { success: true };
}

export async function markStoreExpired(
  input: z.infer<typeof storeActionSchema>
): Promise<ActionResult> {
  const parsedInput = storeActionSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: zodMessage(parsedInput.error) };
  }
  const parsed = parsedInput.data;
  const context = await requireSuperAdmin();
  if (!context) {
    return { success: false, error: "No autorizado" };
  }
  const { supabase } = context;

  const { error } = await supabase
    .from("profiles")
    .update({ status: "EXPIRED" })
    .eq("id", parsed.profileId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/tiendas");
  return { success: true };
}

export async function reactivateTrial(
  input: z.infer<typeof storeActionSchema>
): Promise<ActionResult> {
  const parsedInput = storeActionSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: zodMessage(parsedInput.error) };
  }
  const parsed = parsedInput.data;
  const context = await requireSuperAdmin();
  if (!context) {
    return { success: false, error: "No autorizado" };
  }
  const { supabase } = context;

  const { error } = await supabase
    .from("profiles")
    .update({
      status: "TRIAL",
      trial_ends_at: addDays(new Date(), TRIAL_DAYS),
    })
    .eq("id", parsed.profileId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/tiendas");
  return { success: true };
}
