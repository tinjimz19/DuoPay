import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizePhone } from "@/lib/format";
import type { Database } from "@/types/database.types";

/** Nombre comparable: sin acentos, sin espacios de más, en minúsculas. */
function nombreComparable(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Da de alta un cliente desde otro formulario (una venta o un pedido).
 *
 * Reutiliza uno existente SOLO si es la misma persona: mismo teléfono Y mismo
 * nombre. El teléfono solo no basta —en Venezuela varias personas comparten
 * un número (la casa, un familiar, el negocio)—, y antes eso hacía que al
 * anotar un cliente nuevo la venta se guardara con el nombre de otro que ya
 * tenía ese número, perdiendo el nombre recién escrito. Cuando el nombre es
 * distinto se crea un cliente aparte, que es lo que la tienda pidió al elegir
 * "Cliente nuevo". Mismo nombre y mismo teléfono sí se deduplica: ahí de
 * verdad es la misma persona anotada dos veces.
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
      .select("id, name, phone")
      .eq("user_id", userId)
      .is("deleted_at", null);

    const nombre = nombreComparable(name);
    const match = (existing ?? []).find(
      (client) =>
        normalizePhone(client.phone) === digits &&
        nombreComparable(client.name) === nombre
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
