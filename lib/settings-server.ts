import { cache } from "react";

import type { PaymentMethod } from "@/lib/payment-methods";
import { createClient } from "@/lib/supabase/server";

/**
 * Los métodos de cobro de la tienda.
 *
 * Van envueltos en `cache()` de React por la misma razón que el perfil:
 * la página de clientes, la de cobranza y la de ventas los piden para
 * armar los recordatorios de WhatsApp, y sin esto serían tres consultas
 * iguales en el mismo render.
 */
export const storePaymentMethods = cache(async (): Promise<PaymentMethod[]> => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("id, kind, label, bank, account, holder, document, is_active, sort_order")
    .order("sort_order")
    .order("created_at");

  // Que falte la tabla no debe tumbar la pantalla de clientes: sin datos
  // de pago el recordatorio simplemente sale sin ese bloque.
  if (error) return [];
  return (data ?? []) as PaymentMethod[];
});

/** Solo los que la tienda tiene encendidos, que son los que se mandan. */
export const activePaymentMethods = cache(async (): Promise<PaymentMethod[]> => {
  const todos = await storePaymentMethods();
  return todos.filter((m) => m.is_active);
});
