import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizePhone } from "@/lib/format";
import type { Database } from "@/types/database.types";

/**
 * Da de alta un cliente desde otro formulario (una venta o un pedido).
 *
 * Si ya existe uno con el mismo teléfono, lo reutiliza en vez de duplicarlo:
 * registrar la misma persona dos veces es el error más fácil de cometer
 * cuando el alta va dentro de otro flujo.
 */
export async function ensureClient(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { name: string; phone: string }
): Promise<{ id: string } | { error: string }> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const digits = normalizePhone(phone);

  if (digits.length >= 7) {
    const { data: existing } = await supabase
      .from("clients")
      .select("id, phone")
      .eq("user_id", userId)
      .is("deleted_at", null);

    const match = (existing ?? []).find(
      (client) => normalizePhone(client.phone) === digits
    );

    if (match) {
      return { id: match.id };
    }
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({ user_id: userId, name, phone })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "No se pudo crear el cliente" };
  }

  return { id: data.id };
}
