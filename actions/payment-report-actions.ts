"use server";

import { createClient } from "@/lib/supabase/server";
import { grantSubscriptionDays } from "@/lib/admin-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { zodMessage, type ActionResult } from "@/lib/validation";

const createReportSchema = z.object({
  method: z.string().trim().min(2, "Indica el método de pago").max(60),
  amount: z.number().positive().max(100000).optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  proofPath: z.string().trim().max(600).optional().nullable(),
  notes: z.string().trim().max(400).optional().nullable(),
});

export type CreatePaymentReportInput = z.infer<typeof createReportSchema>;

export async function createPaymentReport(
  input: CreatePaymentReportInput
): Promise<ActionResult> {
  const parsedInput = createReportSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: zodMessage(parsedInput.error) };
  }
  const parsed = parsedInput.data;
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { error } = await supabase.from("payment_reports").insert({
    user_id: user.id,
    method: parsed.method,
    amount: parsed.amount ?? null,
    reference: parsed.reference || null,
    proof_path: parsed.proofPath || null,
    notes: parsed.notes || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

const reviewSchema = z.object({
  reportId: z.string().uuid(),
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

  return { supabase };
}

export async function confirmPaymentReport(
  input: z.infer<typeof reviewSchema>
): Promise<ActionResult> {
  const parsedInput = reviewSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: zodMessage(parsedInput.error) };
  }
  const parsed = parsedInput.data;
  const context = await requireSuperAdmin();
  if (!context) {
    return { success: false, error: "No autorizado" };
  }
  const { supabase } = context;

  const { data: report } = await supabase
    .from("payment_reports")
    .select("id, user_id, status")
    .eq("id", parsed.reportId)
    .maybeSingle();

  if (!report) {
    return { success: false, error: "Reporte no encontrado" };
  }
  if (report.status !== "PENDING") {
    return { success: false, error: "El reporte ya fue revisado" };
  }

  const { error: grantError } = await grantSubscriptionDays(
    supabase,
    report.user_id
  );
  if (grantError) {
    return { success: false, error: grantError.message };
  }

  const { error } = await supabase
    .from("payment_reports")
    .update({ status: "CONFIRMED", reviewed_at: new Date().toISOString() })
    .eq("id", parsed.reportId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/tiendas");
  revalidatePath("/admin/pagos");
  return { success: true };
}

export async function rejectPaymentReport(
  input: z.infer<typeof reviewSchema>
): Promise<ActionResult> {
  const parsedInput = reviewSchema.safeParse(input);
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
    .from("payment_reports")
    .update({ status: "REJECTED", reviewed_at: new Date().toISOString() })
    .eq("id", parsed.reportId)
    .eq("status", "PENDING");

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/pagos");
  return { success: true };
}
