import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

const SUBSCRIPTION_DAYS = 30;

function addDays(base: Date, days: number) {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/**
 * Activa o renueva la suscripción de una tienda: suma 30 días desde el fin
 * actual si aún está vigente, o desde ahora si ya venció.
 */
export async function grantSubscriptionDays(
  supabase: SupabaseClient<Database>,
  profileId: string,
  days: number = SUBSCRIPTION_DAYS
) {
  const { data: current } = await supabase
    .from("profiles")
    .select("subscription_ends_at")
    .eq("id", profileId)
    .maybeSingle();

  const now = new Date();
  const currentEnd = current?.subscription_ends_at
    ? new Date(current.subscription_ends_at)
    : null;
  const base =
    currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;

  return supabase
    .from("profiles")
    .update({
      status: "ACTIVE",
      subscription_ends_at: addDays(base, days),
    })
    .eq("id", profileId);
}
