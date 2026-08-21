"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SaleStatus } from "@/types/database.types";

const CATEGORIES = ["ROPA", "CALZADO", "PERFUME", "OTRO"] as const;

const createSaleSchema = z.object({
  clientId: z.string().uuid("Selecciona un cliente"),
  itemDescription: z
    .string()
    .min(3, "Describe la mercancía")
    .max(300, "Descripción muy larga"),
  category: z.enum(CATEGORIES).default("ROPA"),
  totalAmount: z.coerce
    .number({ message: "Monto inválido" })
    .positive("El monto debe ser mayor a 0"),
  installmentsCount: z.coerce
    .number({ message: "Cuotas inválidas" })
    .int("Las cuotas deben ser un número entero")
    .min(1, "Al menos 1 cuota")
    .max(36, "Máximo 36 cuotas")
    .default(2),
  notes: z.string().max(500).optional().nullable(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

function computeStatus(amountPaid: number, total: number): SaleStatus {
  if (amountPaid >= total) return "COMPLETED";
  if (amountPaid > 0) return "PARTIAL";
  return "PENDING";
}

export async function createSale(input: CreateSaleInput) {
  const parsed = createSaleSchema.parse(input);
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { data, error } = await supabase
    .from("sales")
    .insert({
      user_id: user.id,
      client_id: parsed.clientId,
      item_description: parsed.itemDescription.trim(),
      category: parsed.category,
      total_amount: parsed.totalAmount,
      installments_count: parsed.installmentsCount,
      notes: parsed.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/ventas");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${parsed.clientId}`);

  return { success: true, id: data.id };
}

const recordPaymentSchema = z.object({
  saleId: z.string().uuid(),
  amount: z.coerce
    .number({ message: "Monto inválido" })
    .positive("El abono debe ser mayor a 0"),
  paymentNumber: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function recordPayment(input: z.infer<typeof recordPaymentSchema>) {
  const parsed = recordPaymentSchema.parse(input);
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select("id, client_id, total_amount, amount_paid, status")
    .eq("id", parsed.saleId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (saleError || !sale) {
    return { success: false, error: "Venta no encontrada" };
  }

  if (sale.status === "COMPLETED") {
    return { success: false, error: "Esta venta ya está saldada" };
  }

  const remaining = Number(sale.total_amount) - Number(sale.amount_paid);
  const amount = Math.min(parsed.amount, remaining);
  const newAmountPaid = Number(sale.amount_paid) + amount;

  let paymentNumber = parsed.paymentNumber;
  if (!paymentNumber) {
    const { count } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("sale_id", parsed.saleId)
      .eq("user_id", user.id);
    paymentNumber = (count ?? 0) + 1;
  }

  const { error: paymentError } = await supabase.from("payments").insert({
    user_id: user.id,
    sale_id: parsed.saleId,
    amount,
    payment_number: paymentNumber,
    notes: parsed.notes?.trim() || null,
  });

  if (paymentError) {
    return { success: false, error: paymentError.message };
  }

  const { error: updateError } = await supabase
    .from("sales")
    .update({
      amount_paid: newAmountPaid,
      status: computeStatus(newAmountPaid, Number(sale.total_amount)),
    })
    .eq("id", parsed.saleId)
    .eq("user_id", user.id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  revalidatePath("/");
  revalidatePath("/ventas");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${sale.client_id}`);

  return { success: true };
}

export async function deleteSale(id: string) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const now = new Date().toISOString();

  // Papelera: venta + sus abonos.
  await supabase
    .from("payments")
    .update({ deleted_at: now })
    .eq("sale_id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const { error } = await supabase
    .from("sales")
    .update({ deleted_at: now })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/ventas");
  revalidatePath("/clientes");
  revalidatePath("/papelera");
  return { success: true };
}

export async function restoreSale(id: string) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { data: sale } = await supabase
    .from("sales")
    .select("client_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  await supabase
    .from("payments")
    .update({ deleted_at: null })
    .eq("sale_id", id)
    .eq("user_id", user.id);

  const { error } = await supabase
    .from("sales")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/ventas");
  revalidatePath("/clientes");
  revalidatePath("/papelera");
  if (sale?.client_id) {
    revalidatePath(`/clientes/${sale.client_id}`);
  }
  return { success: true };
}

export async function purgeSale(id: string) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  // Borrado definitivo: la FK en cascada elimina los abonos.
  const { error } = await supabase
    .from("sales")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/papelera");
  return { success: true };
}