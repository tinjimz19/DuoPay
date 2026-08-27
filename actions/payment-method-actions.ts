"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { paymentMethodError } from "@/lib/payment-methods";
import {
  dbErrorMessage,
  zodMessage,
  type ActionResult,
} from "@/lib/validation";

/**
 * Los datos de cobro de la tienda.
 *
 * Se guardan para dos cosas: tenerlos a mano y, sobre todo, pegarlos al
 * recordatorio de WhatsApp. De poco sirve avisarle a alguien que debe si
 * después tiene que escribirte para preguntar dónde pagar.
 */

const KINDS = [
  "PAGO_MOVIL",
  "TRANSFERENCIA",
  "ZELLE",
  "BINANCE",
  "EFECTIVO",
  "OTRO",
] as const;

/** Tope sensato: un recordatorio con quince formas de pago no lo lee nadie. */
const MAX_METODOS = 8;

const texto = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => v || null);

const methodSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  kind: z.enum(KINDS, { message: "Elige un método de pago" }),
  label: texto(60),
  bank: texto(60),
  account: texto(120),
  holder: texto(120),
  document: texto(40),
});

export type PaymentMethodInput = z.infer<typeof methodSchema>;

function revalidar() {
  // El bloque de datos de pago viaja en los recordatorios, así que hay que
  // refrescar también las pantallas que arman esos mensajes.
  revalidatePath("/configuracion");
  revalidatePath("/clientes");
  revalidatePath("/cobranza");
  revalidatePath("/ventas");
}

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { supabase, user: null };
  return { supabase, user };
}

export async function savePaymentMethod(
  input: PaymentMethodInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = methodSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: zodMessage(parsed.error) };
  }
  const values = parsed.data;

  // La misma comprobación que ve la persona en pantalla, repetida aquí:
  // el formulario se puede saltar, el servidor no.
  const falta = paymentMethodError(values);
  if (falta) return { success: false, error: falta };

  const { supabase, user } = await requireUser();
  if (!user) return { success: false, error: "No autorizado" };

  const fila = {
    kind: values.kind,
    label: values.label,
    bank: values.bank,
    account: values.account,
    holder: values.holder,
    document: values.document,
  };

  if (values.id) {
    const { error } = await supabase
      .from("payment_methods")
      .update(fila)
      .eq("id", values.id)
      .eq("user_id", user.id);
    if (error) return { success: false, error: dbErrorMessage(error.message) };
    revalidar();
    return { success: true, id: values.id };
  }

  const { count } = await supabase
    .from("payment_methods")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) >= MAX_METODOS) {
    return {
      success: false,
      error: `Ya tienes ${MAX_METODOS} métodos de pago. Borra uno para agregar otro.`,
    };
  }

  const { data, error } = await supabase
    .from("payment_methods")
    .insert({ ...fila, user_id: user.id, sort_order: count ?? 0 })
    .select("id")
    .single();

  if (error) return { success: false, error: dbErrorMessage(error.message) };
  revalidar();
  return { success: true, id: data.id as string };
}

export async function setPaymentMethodActive(
  id: string,
  active: boolean
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, error: "Método inválido" };
  }
  const { supabase, user } = await requireUser();
  if (!user) return { success: false, error: "No autorizado" };

  const { error } = await supabase
    .from("payment_methods")
    .update({ is_active: active })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, error: dbErrorMessage(error.message) };
  revalidar();
  return { success: true };
}

/**
 * Aquí sí se borra de verdad, sin papelera. Un método de pago no arrastra
 * historia —los abonos ya registrados no lo referencian— y volver a
 * escribirlo cuesta veinte segundos.
 */
export async function deletePaymentMethod(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, error: "Método inválido" };
  }
  const { supabase, user } = await requireUser();
  if (!user) return { success: false, error: "No autorizado" };

  const { error } = await supabase
    .from("payment_methods")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, error: dbErrorMessage(error.message) };
  revalidar();
  return { success: true };
}
