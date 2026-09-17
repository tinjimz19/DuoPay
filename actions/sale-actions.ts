"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { caracasDateStr, formatCurrency } from "@/lib/format";
import { chargeDateIso, currentQuincena } from "@/lib/quincenas";
import { ensureClient } from "@/lib/clients-server";
import {
  dbErrorMessage,
  newClientSchema,
  optionalUuid,
  zodMessage,
  type ActionResult,
} from "@/lib/validation";
import type { SaleStatus } from "@/types/database.types";

/*
 * La categoría ya no es una lista fija: la administra el super admin. Se
 * valida el FORMATO aquí y la EXISTENCIA la impone la clave foránea de la
 * base, que es la única que puede saber el catálogo del momento.
 */
const categorySchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9_]{2,32}$/, "Categoría inválida");

/** Los montos viven como NUMERIC(10,2): nada de centésimas fantasma. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * ¿Una fecha de cobro escrita a mano es creíble?
 *
 * El rango no es burocracia: sin él, un dedazo como 2206 en vez de 2026 deja
 * una venta que nadie va a cobrar nunca y que además no molesta a nadie,
 * porque queda eternamente "por empezar" y no aparece en cobranza.
 */
function fechaRazonable(iso: string): boolean {
  const dia = Date.parse(`${iso}T12:00:00-04:00`);
  const hoy = Date.parse(`${caracasDateStr()}T12:00:00-04:00`);
  if (!Number.isFinite(dia)) return false;
  const dias = (dia - hoy) / 86_400_000;
  return dias >= -366 && dias <= 366;
}

/** La fecha suelta de un pago único. Opcional: casi ninguna venta la usa. */
const fechaDeCobroSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .refine(fechaRazonable, "Esa fecha está demasiado lejos")
  .optional()
  .nullable();

/**
 * Qué fecha de primer cobro se guarda.
 *
 * Por defecto se calcula del desplazamiento de quincenas: viaja el número
 * —0 = esta, 1 = la próxima— y no la fecha, así no puede llegar una fecha
 * inventada desde el navegador.
 *
 * La excepción es el pago único. Ahí la tienda pacta un día concreto ("me
 * paga el 25") que no existe en el calendario de quincenas, y ese día sí
 * viaja tal cual. Con dos o más cuotas la fecha suelta se ignora aunque
 * llegue: habría que inventar cuándo caen las siguientes.
 */
function fechaDePrimerCobro(params: {
  installmentsCount: number;
  firstChargeOffset: number;
  firstChargeDate?: string | null;
}): string {
  if (params.installmentsCount === 1 && params.firstChargeDate) {
    return params.firstChargeDate;
  }
  return chargeDateIso(currentQuincena() + params.firstChargeOffset);
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
  category: categorySchema.default("ROPA"),
  totalAmount: z.coerce
    .number({ message: "Monto inválido" })
    .positive("El monto debe ser mayor a 0"),
  installmentsCount: z.coerce
    .number({ message: "Cuotas inválidas" })
    .int("Las cuotas deben ser un número entero")
    .min(1, "Al menos 1 cuota")
    .max(36, "Máximo 36 cuotas")
    .default(2),
  // Desde qué jornada de cobro empieza a pagar, contada desde la vigente:
  // 0 = esta, 1 = la próxima, 2 = la de después. Viaja el desplazamiento y
  // no la fecha, así no puede llegar una fecha inventada.
  firstChargeOffset: z.coerce
    .number({ message: "Primer cobro inválido" })
    .int()
    .min(0, "Primer cobro inválido")
    .max(5, "Primer cobro demasiado lejos")
    .default(1),
  // Y la excepción: el que paga todo de una vez un día concreto.
  firstChargeDate: fechaDeCobroSchema,
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
      first_charge_date: fechaDePrimerCobro(values),
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


/**
 * Qué se puede editar de una venta ya registrada.
 *
 * NO va el cliente. Mover una venta de una persona a otra arrastra también
 * sus abonos, y deja dos historiales mintiendo: uno que cobró algo que no
 * vendió y otro que debe algo que nunca compró. Si de verdad se registró al
 * cliente equivocado, lo correcto es anular la venta y rehacerla.
 *
 * Tampoco van los productos del inventario: el stock ya se movió cuando se
 * registró la venta, y deshacerlo bien es otra funcionalidad.
 */
const updateSaleSchema = z.object({
  id: z.string().uuid(),
  itemDescription: z
    .string()
    .min(3, "Describe la mercancía")
    .max(300, "Descripción muy larga"),
  category: categorySchema,
  totalAmount: z.coerce
    .number({ message: "Monto inválido" })
    .positive("El monto debe ser mayor a 0"),
  installmentsCount: z.coerce
    .number({ message: "Cuotas inválidas" })
    .int("Las cuotas deben ser un número entero")
    .min(1, "Al menos 1 cuota")
    .max(36, "Máximo 36 cuotas"),
  firstChargeOffset: z.coerce
    .number({ message: "Primer cobro inválido" })
    .int()
    .min(0, "Primer cobro inválido")
    .max(5, "Primer cobro demasiado lejos")
    .default(1),
  firstChargeDate: fechaDeCobroSchema,
  notes: z.string().max(500).optional().nullable(),
  /**
   * La tienda ya vio el aviso de que el monto nuevo queda por debajo de lo
   * abonado y aun así quiere guardar.
   */
  confirmarSaldoAFavor: z.boolean().optional().default(false),
});

export type UpdateSaleInput = z.infer<typeof updateSaleSchema>;

export type UpdateSaleResult =
  | { success: true }
  | {
      success: false;
      error: string;
      /** El monto nuevo no alcanza lo ya abonado: hace falta confirmar. */
      needsConfirm?: boolean;
      /** Cuánto le quedaría a favor al cliente si se guarda así. */
      aFavor?: number;
    };

/**
 * Edita una venta ya registrada.
 *
 * EL AVISO DEL SALDO A FAVOR
 *
 * Bajarle el monto a una venta que ya tiene abonos puede dejar al cliente
 * habiendo pagado de más. No se impide —a veces el monto se registró mal y
 * corregirlo es justo lo que hay que hacer— pero no se hace en silencio: la
 * primera llamada devuelve `needsConfirm` con la cifra exacta que quedaría a
 * favor, y solo la segunda, ya confirmada, guarda.
 *
 * Los abonos NUNCA se tocan. Lo que cambia es la venta; lo que el cliente
 * puso sigue registrado tal cual, que es el dato que no se puede perder.
 */
export async function updateSale(input: UpdateSaleInput): Promise<UpdateSaleResult> {
  const parsed = updateSaleSchema.safeParse(input);
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

  const { data: venta, error: buscarError } = await supabase
    .from("sales")
    .select("id, client_id, amount_paid")
    .eq("id", values.id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (buscarError) {
    return { success: false, error: dbErrorMessage(buscarError.message) };
  }
  if (!venta) {
    return { success: false, error: "Esa venta ya no existe" };
  }

  const total = round2(values.totalAmount);
  const abonado = round2(Number(venta.amount_paid));

  if (total < abonado && !values.confirmarSaldoAFavor) {
    return {
      success: false,
      needsConfirm: true,
      aFavor: round2(abonado - total),
      error:
        `Este cliente ya abonó ${abonado} y el monto nuevo es ${total}. ` +
        `Quedaría a favor ${round2(abonado - total)}.`,
    };
  }

  const { error } = await supabase
    .from("sales")
    .update({
      item_description: values.itemDescription.trim(),
      category: values.category,
      total_amount: total,
      installments_count: values.installmentsCount,
      first_charge_date: fechaDePrimerCobro(values),
      notes: values.notes?.trim() || null,
    })
    .eq("id", values.id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: dbErrorMessage(error.message) };
  }

  /*
    `status` y `amount_paid` no se tocan aquí: los mantiene la base cuando
    entra o sale un abono. Pero al cambiar el total, el estado guardado puede
    quedar viejo —una venta que era PARTIAL y ahora está saldada, o al revés—,
    así que se recalcula con la misma regla de siempre.
  */
  const nuevoEstado: SaleStatus =
    abonado >= total ? "COMPLETED" : abonado > 0 ? "PARTIAL" : "PENDING";

  await supabase
    .from("sales")
    .update({ status: nuevoEstado })
    .eq("id", values.id)
    .eq("user_id", user.id);

  revalidateSaleViews(venta.client_id);
  return { success: true };
}
