"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formatCurrency } from "@/lib/format";
import {
  chargeDateIso,
  currentQuincena,
  nextQuincena,
} from "@/lib/quincenas";
import { ensureClient } from "@/lib/clients-server";
import {
  dbErrorMessage,
  newClientSchema,
  optionalUuid,
  zodMessage,
  type ActionResult,
} from "@/lib/validation";

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
  revalidatePath("/inventario");
  if (clientId) {
    revalidatePath(`/clientes/${clientId}`);
  }
}

const createSaleSchema = z.object({
  clientId: optionalUuid,
  // Alta de cliente desde el mismo formulario de venta.
  newClient: newClientSchema.optional().nullable(),
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
  // Qué salió del inventario. Vacío = venta suelta que no mueve stock.
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.coerce
          .number({ message: "Cantidad inválida" })
          .int("Las cantidades deben ser enteras")
          .positive("Las cantidades deben ser mayores a 0")
          .max(10_000, "Cantidad demasiado grande"),
      })
    )
    .max(20, "Demasiados productos en una venta")
    .default([]),
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

  let clientId = values.clientId;
  if (!clientId && values.newClient) {
    const created = await ensureClient(supabase, user.id, values.newClient);
    if ("error" in created) {
      return { success: false, error: created.error };
    }
    clientId = created.id;
  }

  if (!clientId) {
    return { success: false, error: "Selecciona un cliente" };
  }

  // Una misma línea repetida sumaría dos veces contra el mismo stock.
  const wanted = new Map<string, number>();
  for (const item of values.items) {
    wanted.set(item.productId, (wanted.get(item.productId) ?? 0) + item.quantity);
  }

  // El tope del formulario es comodidad; la verdad se revalida aquí.
  if (wanted.size > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, name, stock")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .in("id", Array.from(wanted.keys()));

    const byId = new Map((products ?? []).map((p) => [p.id, p]));

    for (const [productId, quantity] of Array.from(wanted.entries())) {
      const product = byId.get(productId);
      if (!product) {
        return { success: false, error: "Un producto de la venta ya no existe" };
      }
      if (quantity > Number(product.stock)) {
        return {
          success: false,
          error:
            Number(product.stock) <= 0
              ? `No te queda ${product.name}`
              : `Solo tienes ${product.stock} de ${product.name}`,
        };
      }
    }
  }

  const { data, error } = await supabase
    .from("sales")
    .insert({
      user_id: user.id,
      client_id: clientId,
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
      error: error ? dbErrorMessage(error.message) : "No se pudo registrar la venta",
    };
  }

  if (wanted.size > 0) {
    const { error: stockError } = await supabase.from("stock_movements").insert(
      Array.from(wanted, ([productId, quantity]) => ({
        user_id: user.id,
        product_id: productId,
        sale_id: data.id,
        kind: "VENTA" as const,
        quantity: -quantity,
      }))
    );

    // La venta ya quedó registrada; si el stock falla se avisa pero no se
    // pierde la venta, que es lo que de verdad importa.
    if (stockError) {
      revalidateSaleViews(clientId);
      revalidatePath("/inventario");
      return {
        success: false,
        error: `Se registró la venta, pero el inventario no se movió: ${dbErrorMessage(stockError.message)}`,
      };
    }
  }

  revalidatePath("/inventario");

  revalidateSaleViews(clientId);
  revalidatePath("/clientes");
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

  const result = await insertPayment(
    supabase,
    user.id,
    values.saleId,
    values.amount,
    values.notes ?? null
  );

  if ("error" in result) {
    return { success: false, error: result.error };
  }

  revalidateSaleViews(result.clientId);

  return {
    success: true,
    amount: result.amount,
    clamped: result.clamped,
  };
}

/**
 * Inserta un abono contra una venta, recortado al saldo pendiente.
 * El número de abono se calcula aquí y no en el cliente: si se borró uno
 * intermedio, contar filas repetiría un número ya usado.
 */
async function insertPayment(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  saleId: string,
  requestedAmount: number,
  notes: string | null
): Promise<
  | { amount: number; clamped: boolean; clientId: string | null }
  | { error: string }
> {
  const { data: sale } = await supabase
    .from("sales")
    .select("id, client_id, total_amount, amount_paid")
    .eq("id", saleId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!sale) {
    return { error: "Venta no encontrada" };
  }

  const remaining = round2(
    Number(sale.total_amount) - Number(sale.amount_paid)
  );

  if (remaining <= 0) {
    return { error: "Esta venta ya está saldada" };
  }

  const requested = round2(requestedAmount);
  const amount = Math.min(requested, remaining);

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
    amount,
    payment_number: (last?.payment_number ?? 0) + 1,
    notes: notes?.trim() || null,
  });

  if (error) {
    return { error: dbErrorMessage(error.message) };
  }

  return { amount, clamped: amount < requested, clientId: sale.client_id };
}

// ------------------------------------------------------------------
// Cobro de la quincena
//
// La pantalla de Cobranza propone el monto (lo calcula el servidor al pintar
// la lista), pero el cobro pasa siempre por un diálogo donde se puede ajustar:
// en la calle la gente abona lo que trae, no la cuota exacta.
// Cada monto se recorta al saldo de su venta, así nadie sobrepaga.
// ------------------------------------------------------------------

const paymentKindSchema = z.enum(["COBRO", "ADELANTO", "ABONO"]);

const KIND_NOTE: Record<z.infer<typeof paymentKindSchema>, string> = {
  COBRO: "Cobro de quincena",
  ADELANTO: "Adelanto",
  ABONO: "Abono",
};

const batchSchema = z.object({
  items: z
    .array(
      z.object({
        saleId: z.string().uuid(),
        amount: z.coerce
          .number({ message: "Monto inválido" })
          .positive("Los montos deben ser mayores a 0"),
      })
    )
    .min(1, "No hay nada que cobrar")
    .max(30, "Demasiadas ventas a la vez"),
  kind: paymentKindSchema.default("ABONO"),
  notes: z.string().max(500).optional().nullable(),
});

export type RecordPaymentsBatchInput = z.infer<typeof batchSchema>;

/** Registra varios abonos de un golpe: lo que se cobra en una visita. */
export async function recordPaymentsBatch(
  input: RecordPaymentsBatchInput
): Promise<ActionResult<{ amount: number; count: number; clamped: boolean }>> {
  const parsed = batchSchema.safeParse(input);
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

  const notes = values.notes?.trim() || KIND_NOTE[values.kind];

  let total = 0;
  let count = 0;
  let clamped = false;
  let clientId: string | null = null;
  const fallos: string[] = [];

  for (const item of values.items) {
    const result = await insertPayment(
      supabase,
      user.id,
      item.saleId,
      item.amount,
      notes
    );

    if ("error" in result) {
      fallos.push(result.error);
      continue;
    }

    total = round2(total + result.amount);
    count += 1;
    clamped = clamped || result.clamped;
    clientId = result.clientId ?? clientId;
  }

  revalidateSaleViews(clientId);

  if (count === 0) {
    return { success: false, error: fallos[0] ?? "No se registró ningún abono" };
  }

  return { success: true, amount: total, count, clamped };
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
    return { success: false, error: dbErrorMessage(error.message) };
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
    return { success: false, error: dbErrorMessage(error.message) };
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
    return { success: false, error: dbErrorMessage(error.message) };
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
    return { success: false, error: dbErrorMessage(error.message) };
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
    return { success: false, error: dbErrorMessage(error.message) };
  }

  await supabase
    .from("payments")
    .update({ deleted_at: now, deleted_via: "sale" })
    .eq("sale_id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  // La mercancía vuelve al inventario.
  await supabase
    .from("stock_movements")
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

  // Vuelve a salir del inventario lo que esta venta se llevó.
  await supabase
    .from("stock_movements")
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
    return { success: false, error: dbErrorMessage(error.message) };
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
    return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidatePath("/papelera");
  return { success: true };
}
