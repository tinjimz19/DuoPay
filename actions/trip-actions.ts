"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dbErrorMessage, zodMessage, type ActionResult } from "@/lib/validation";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de viaje inválida");

/**
 * Crea un viaje (una fecha). Si ya existe uno con esa fecha, lo reutiliza:
 * el índice único lo impediría igual, pero así el botón nunca falla por
 * "repetido" y simplemente te deja en el viaje que ya tenías.
 */
export async function createTrip(
  input: { date: string }
): Promise<ActionResult<{ id: string }>> {
  const parsed = dateSchema.safeParse(input.date);
  if (!parsed.success) return { success: false, error: zodMessage(parsed.error) };
  const fecha = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: "No autorizado" };

  const { data: existente } = await supabase
    .from("trips")
    .select("id")
    .eq("user_id", user.id)
    .eq("travel_date", fecha)
    .maybeSingle();

  if (existente) {
    revalidatePath("/pedidos");
    return { success: true, id: existente.id };
  }

  const { data, error } = await supabase
    .from("trips")
    .insert({ user_id: user.id, travel_date: fecha })
    .select("id")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error ? dbErrorMessage(error.message) : "No se pudo crear el viaje",
    };
  }

  revalidatePath("/pedidos");
  return { success: true, id: data.id };
}

/**
 * Borra un viaje. Sus pedidos NO se pierden: la clave foránea los deja en
 * "Sin viaje" (ON DELETE SET NULL). Es lo que permite cerrar un viaje viejo
 * sin arrastrarse los encargos que quedaron sueltos.
 */
export async function deleteTrip(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: "No autorizado" };

  const { error } = await supabase
    .from("trips")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, error: dbErrorMessage(error.message) };

  revalidatePath("/pedidos");
  return { success: true };
}
