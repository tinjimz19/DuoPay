"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  dbErrorMessage,
  zodMessage,
  type ActionResult,
} from "@/lib/validation";

const clientFieldsSchema = {
  name: z.string().min(2, "El nombre es obligatorio").max(120),
  phone: z
    .string()
    .trim()
    .min(7, "El número de teléfono es obligatorio")
    .max(30),
  notes: z.string().max(500).optional().nullable(),
};

const createClientSchema = z.object(clientFieldsSchema);

export type CreateClientInput = z.infer<typeof createClientSchema>;

export async function createClient(
  input: CreateClientInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = createClientSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: zodMessage(parsed.error) };
  }
  const values = parsed.data;

  const supabase = createSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      user_id: user.id,
      name: values.name.trim(),
      phone: values.phone.trim(),
      notes: values.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error ? dbErrorMessage(error.message) : "Error al crear el cliente",
    };
  }

  revalidatePath("/");
  revalidatePath("/clientes");
  revalidatePath("/ventas");
  revalidatePath("/ventas/nueva");

  return { success: true, id: data.id };
}

const updateClientSchema = z.object({
  id: z.string().uuid(),
  ...clientFieldsSchema,
});

export async function updateClient(
  input: z.infer<typeof updateClientSchema>
): Promise<ActionResult> {
  const parsed = updateClientSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: zodMessage(parsed.error) };
  }
  const values = parsed.data;

  const supabase = createSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { error } = await supabase
    .from("clients")
    .update({
      name: values.name.trim(),
      phone: values.phone.trim(),
      notes: values.notes?.trim() || null,
    })
    .eq("id", values.id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${values.id}`);
  return { success: true };
}

// ------------------------------------------------------------------
// Papelera
//
// Al borrar un cliente, sus ventas y abonos caen marcados con
// deleted_via = 'client'. Restaurar solo revive esos: una venta que se
// borró aparte hace meses se queda en la papelera donde la dejaste.
// ------------------------------------------------------------------

export async function deleteClient(id: string): Promise<ActionResult> {
  const supabase = createSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const now = new Date().toISOString();

  const { data: sales } = await supabase
    .from("sales")
    .select("id")
    .eq("client_id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const saleIds = (sales ?? []).map((s) => s.id);

  if (saleIds.length > 0) {
    // Las ventas primero: con la venta ya en papelera, borrar sus abonos no
    // dispara el recálculo y las cifras quedan congeladas.
    await supabase
      .from("sales")
      .update({ deleted_at: now, deleted_via: "client" })
      .in("id", saleIds)
      .eq("user_id", user.id);

    await supabase
      .from("payments")
      .update({ deleted_at: now, deleted_via: "client" })
      .in("sale_id", saleIds)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    // La mercancía de esas ventas vuelve al inventario.
    await supabase
      .from("stock_movements")
      .update({ deleted_at: now, deleted_via: "client" })
      .in("sale_id", saleIds)
      .eq("user_id", user.id)
      .is("deleted_at", null);
  }

  const { error } = await supabase
    .from("clients")
    .update({ deleted_at: now })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidatePath("/");
  revalidatePath("/clientes");
  revalidatePath("/ventas");
  revalidatePath("/reportes");
  revalidatePath("/inventario");
  revalidatePath("/papelera");
  return { success: true };
}

export async function restoreClient(id: string): Promise<ActionResult> {
  const supabase = createSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { data: sales } = await supabase
    .from("sales")
    .select("id")
    .eq("client_id", id)
    .eq("user_id", user.id)
    .eq("deleted_via", "client");

  const saleIds = (sales ?? []).map((s) => s.id);

  if (saleIds.length > 0) {
    // Los abonos primero: mientras la venta siga en papelera el trigger no
    // recalcula, así que al restaurar la venta ya encuentra sus abonos.
    await supabase
      .from("payments")
      .update({ deleted_at: null, deleted_via: null })
      .in("sale_id", saleIds)
      .eq("user_id", user.id)
      .eq("deleted_via", "client");

    await supabase
      .from("stock_movements")
      .update({ deleted_at: null, deleted_via: null })
      .in("sale_id", saleIds)
      .eq("user_id", user.id)
      .eq("deleted_via", "client");

    await supabase
      .from("sales")
      .update({ deleted_at: null, deleted_via: null })
      .in("id", saleIds)
      .eq("user_id", user.id);
  }

  const { error } = await supabase
    .from("clients")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidatePath("/");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/ventas");
  revalidatePath("/reportes");
  revalidatePath("/inventario");
  revalidatePath("/papelera");
  return { success: true };
}

export async function purgeClient(id: string): Promise<ActionResult> {
  const supabase = createSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  // Borrado definitivo: la FK en cascada elimina ventas y abonos.
  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidatePath("/papelera");
  return { success: true };
}
