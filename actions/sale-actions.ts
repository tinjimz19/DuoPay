"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formatCurrency } from "@/lib/format";
import {
  chargeDateIso,
  currentQuincena,
  nextQuincena,
  saleSchedule,
} from "@/lib/quincenas";
import { zodMessage, type ActionResult } from "@/lib/validation";

const CATEGORIES = ["ROPA", "CALZADO", "PERFUME", "OTRO"] as const;

/** Los montos viven como NUMERIC(10,2): nada de centésimas fantasma. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function revalidateSaleViews(clientId?: string | null) {
  revalidatePath("/");
  revalidatePath("/ventas");
  revalidatePath("/clientes");
  revalidatePath("/cobranza");
  revalidatePath("/reportes");
  if (clientId) {
    revalidatePath(`/clientes/${clientId}`);
  }
}

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
  // Desde qué jornada de cobro empieza a pagar. El cliente manda la
  // intención, no la fecha: así no puede llegar una fecha inventada.
  firstCharge: z.enum(["ESTA", "PROXIMA"]).default("PROXIMA"),
  notes: z.string().max(500).optional().nullable(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export async function createSale(
  input: CreateSaleInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSaleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: zodMessage(parsed.error) };
  }
  const values = parsed.data;

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
      client_id: values.clientId,
      item_description: values.itemDescription.trim(),
      category: values.category,
      total_amount: round2(values.totalAmount),
      installments_count: values.installmentsCount,
      first_charge_date: chargeDateIso(
        values.firstCharge === "ESTA" ? currentQuincena() : nextQuincena()
      ),
      notes: values.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "No se pudo registrar la venta",
    };
  }

  revalidateSaleViews(values.clientId);
  revalidatePath("/cobranza");
  revalidatePath("/ventas/nueva");

  return { success: true, id: data.id };
}

// ------------------------------------------------------------------
// Abonos
//
// amount_paid y status de la venta los mantiene un trigger en Postgres a
// partir de la suma de abonos activos (ver supabase/schema.sql §13). Aquí
// solo se insertan, corrigen o borran filas de `payments`: así dos abonos
// simultáneos no se pisan y corregir uno no descuadra la venta.
// ------------------------------------------------------------------

const recordPaymentSchema = z.object({
  saleId: z.string().uuid(),
  amount: z.coerce
    .number({ message: "Monto inválido" })
    .positive("El abono debe ser mayor a 0"),
  notes: z.string().max(500).optional().nullable(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export async function recordPayment(
  input: RecordPaymentInput
): Promise<ActionResult<{ amount: number; clamped: boolean }>> {
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: zodMessage(parsed.error) };
  }
  const values = parsed.data;

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
    .eq("id", values.saleId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (saleError || !sale) {
    return { success: false, error: "Venta no encontrada" };
  }

  const remaining = round2(
    Number(sale.total_amount) - Number(sale.amount_paid)
  );

  if (remaining <= 0) {
    return { success: false, error: "Esta venta ya está saldada" };
  }

  const requested = round2(values.amount);
  const amount = Math.min(requested, remaining);

  // El número de cuota se calcula aquí, no en el cliente: si se borró un
  // abono intermedio, contar filas repetiría un número ya usado.
  const { data: last } = await supabase
    .from("payments")
    .select("payment_number")
    .eq("sale_id", values.saleId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .not("payment_number", "is", null)
    .order("payment_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const paymentNumber = (last?.payment_number ?? 0) + 1;

  const { error: paymentError } = await supabase.from("payments").insert({
    user_id: user.id,
    sale_id: values.saleId,
    amount,
    payment_number: paymentNumber,
    notes: values.notes?.trim() || null,
  });

  if (paymentError) {
    return { success: false, error: paymentError.message };
  }

  revalidateSaleViews(sale.client_id);

  return { success: true, amount, clamped: amount < requested };
}

// ------------------------------------------------------------------
// Cobro de la quincena
//
// El monto NO viaja desde el navegador: el servidor mira la venta, calcula
// qué le toca poner en esta jornada de cobro (arrastres incluidos) y registra
// eso. Un toque en la pantalla de Cobranza y listo.
// ------------------------------------------------------------------

async function chargeQuincena(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  saleId: string
): Promise<{ amount: number; clientId: string | null }> {
  const { data: sale } = await supabase
    .from("sales")
    .select(
      "id, client_id, total_amount, amount_paid, installment_amount, installments_count, first_charge_date"
    )
    .eq("id", saleId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!sale) return { amount: 0, clientId: null };

  const schedule = saleSchedule({
    total_amount: Number(sale.total_amount),
    amount_paid: Number(sale.amount_paid),
    installment_amount: Number(sale.installment_amount),
    installments_count: sale.installments_count,
    first_charge_date: sale.first_charge_date,
  });

  if (schedule.dueNow <= 0) {
    return { amount: 0, clientId: sale.client_id };
  }

  const { data: last } = await supabase
    .from("payments")
    .select("payment_number")
    .eq("sale_id", saleId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("payment_number", "is", null)
    .order("payment_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("payments").insert({
    user_id: userId,
    sale_id: saleId,
    amount: schedule.dueNow,
    payment_number: (last?.payment_number ?? 0) + 1,
    notes:
      schedule.behind > 0
        ? `Cobro de quincena · incluye ${schedule.behind} atrasada${schedule.behind === 1 ? "" : "s"}`
        : "Cobro de quincena",
  });

  if (error) throw new Error(error.message);

  return { amount: schedule.dueNow, clientId: sale.client_id };
}

/** Registra de un toque lo que esta venta debe poner en la quincena actual. */
export async function recordQuincenaPayment(
  saleId: string
): Promise<ActionResult<{ amount: number }>> {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  if (!z.string().uuid().safeParse(saleId).success) {
    return { success: false, error: "Venta inválida" };
  }

  try {
    const { amount, clientId } = await chargeQuincena(supabase, user.id, saleId);

    if (amount <= 0) {
      return { success: false, error: "Esta venta no tiene nada que cobrar ahora" };
    }

    revalidateSaleViews(clientId);
    return { success: true, amount };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "No se pudo registrar el cobro",
    };
  }
}

/** Cobra de un toque todo lo que un cliente debe poner en esta quincena. */
export async function recordQuincenaPaymentsForClient(
  clientId: string
): Promise<ActionResult<{ amount: number; sales: number }>> {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  if (!z.string().uuid().safeParse(clientId).success) {
    return { success: false, error: "Cliente inválido" };
  }

  const { data: sales } = await supabase
    .from("sales")
    .select("id")
    .eq("client_id", clientId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .neq("status", "COMPLETED")
    .order("created_at", { ascending: true });

  let total = 0;
  let count = 0;

  try {
    for (const sale of sales ?? []) {
      const { amount } = await chargeQuincena(supabase, user.id, sale.id);
      if (amount > 0) {
        total = round2(total + amount);
        count += 1;
      }
    }
  } catch (err) {
    revalidateSaleViews(clientId);
    return {
      success: false,
      error: err instanceof Error ? err.message : "No se pudo registrar el cobro",
    };
  }

  if (count === 0) {
    return { success: false, error: "Este cliente no tiene nada que poner ahora" };
  }

  revalidateSaleViews(clientId);
  return { success: true, amount: total, sales: count };
}

const updatePaymentSchema = z.object({
  id: z.string().uuid(),
  amount: z.coerce
    .number({ message: "Monto inválido" })
    .positive("El abono debe ser mayor a 0"),
  notes: z.string().max(500).optional().nullable(),
});

export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;

/** Corrige un abono mal registrado sin tener que borrar la venta entera. */
export async function updatePayment(
  input: UpdatePaymentInput
): Promise<ActionResult> {
  const parsed = updatePaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: zodMessage(parsed.error) };
  }
  const values = parsed.data;

  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id, sale_id")
    .eq("id", values.id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!payment) {
    return { success: false, error: "Abono no encontrado" };
  }

  const { data: sale } = await supabase
    .from("sales")
    .select("id, client_id, total_amount")
    .eq("id", payment.sale_id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!sale) {
    return {
      success: false,
      error: "La venta de este abono está en la papelera",
    };
  }

  const { data: others } = await supabase
    .from("payments")
    .select("amount")
    .eq("sale_id", payment.sale_id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .neq("id", values.id);

  const otherTotal = (others ?? []).reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );
  const maxAmount = round2(Number(sale.total_amount) - otherTotal);

  if (maxAmount <= 0) {
    return {
      success: false,
      error: "Los demás abonos ya cubren el total de la venta",
    };
  }

  const amount = round2(values.amount);

  if (amount > maxAmount) {
    return {
      success: false,
      error: `El abono no puede pasar de ${formatCurrency(maxAmount)}`,
    };
  }

  const { error } = await supabase
    .from("payments")
    .update({ amount, notes: values.notes?.trim() || null })
    .eq("id", values.id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateSaleViews(sale.client_id);
  return { success: true };
}

async function paymentClientId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  paymentId: string
): Promise<string | null> {
  const { data: payment } = await supabase
    .from("payments")
    .select("sale_id")
    .eq("id", paymentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!payment) return null;

  const { data: sale } = await supabase
    .from("sales")
    .select("client_id")
    .eq("id", payment.sale_id)
    .eq("user_id", userId)
    .maybeSingle();

  return sale?.client_id ?? null;
}

export async function deletePayment(id: string): Promise<ActionResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const clientId = await paymentClientId(supabase, user.id, id);

  // deleted_via en NULL = borrado directo. Restaurar la venta no lo revive.
  const { error } = await supabase
    .from("payments")
    .update({ deleted_at: new Date().toISOString(), deleted_via: null })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateSaleViews(clientId);
  revalidatePath("/papelera");
  return { success: true };
}

export async function restorePayment(id: string): Promise<ActionResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id, sale_id, amount")
    .eq("id", id)
    .eq("user_id", user.id)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (!payment) {
    return { success: false, error: "Abono no encontrado" };
  }

  const { data: sale } = await supabase
    .from("sales")
    .select("id, client_id, total_amount, amount_paid")
    .eq("id", payment.sale_id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!sale) {
    return {
      success: false,
      error: "Restaura primero la venta de este abono",
    };
  }

  const remaining = round2(
    Number(sale.total_amount) - Number(sale.amount_paid)
  );

  if (round2(Number(payment.amount)) > remaining) {
    return {
      success: false,
      error: `No cabe: a la venta solo le faltan ${formatCurrency(remaining)}`,
    };
  }

  const { error } = await supabase
    .from("payments")
    .update({ deleted_at: null, deleted_via: null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateSaleViews(sale.client_id);
  revalidatePath("/papelera");
  return { success: true };
}

export async function purgePayment(id: string): Promise<ActionResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { error } = await supabase
    .from("payments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .not("deleted_at", "is", null);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/papelera");
  return { success: true };
}

// ------------------------------------------------------------------
// Papelera de ventas
// ------------------------------------------------------------------

export async function deleteSale(id: string): Promise<ActionResult> {
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
    .is("deleted_at", null)
    .maybeSingle();

  const now = new Date().toISOString();

  // La venta primero: con la venta ya en papelera, el trigger de recálculo
  // no toca sus cifras al borrar los abonos, y quedan congeladas.
  const { error } = await supabase
    .from("sales")
    .update({ deleted_at: now })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (error) {
    return { success: false, error: error.message };
  }

  await supabase
    .from("payments")
    .update({ deleted_at: now, deleted_via: "sale" })
    .eq("sale_id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  revalidateSaleViews(sale?.client_id);
  revalidatePath("/papelera");
  return { success: true };
}

export async function restoreSale(id: string): Promise<ActionResult> {
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
    .select("client_id, clients(deleted_at)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sale) {
    return { success: false, error: "Venta no encontrada" };
  }

  const clientDeletedAt = (
    sale.clients as unknown as { deleted_at: string | null } | null
  )?.deleted_at;

  if (clientDeletedAt) {
    return {
      success: false,
      error: "Restaura primero al cliente de esta venta",
    };
  }

  // Solo los abonos que cayeron con esta venta; uno borrado a mano se queda
  // borrado.
  await supabase
    .from("payments")
    .update({ deleted_at: null, deleted_via: null })
    .eq("sale_id", id)
    .eq("user_id", user.id)
    .eq("deleted_via", "sale");

  const { error } = await supabase
    .from("sales")
    .update({ deleted_at: null, deleted_via: null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateSaleViews(sale.client_id);
  revalidatePath("/papelera");
  return { success: true };
}

export async function purgeSale(id: string): Promise<ActionResult> {
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
