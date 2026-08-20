"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const createClientSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio").max(120),
  phone: z.string().max(30).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

export type ActionResult<T = {}> = ({ success: true } & T) | {
  success: false;
  error: string;
};

export async function createClient(
  input: CreateClientInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = createClientSchema.parse(input);
  const supabase = createSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false as const, error: "No autorizado" };
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      user_id: user.id,
      name: parsed.name.trim(),
      phone: parsed.phone?.trim() || null,
      notes: parsed.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false as const, error: error?.message ?? "Error al crear el cliente" };
  }

  revalidatePath("/");
  revalidatePath("/clientes");
  revalidatePath("/ventas");
  revalidatePath("/ventas/nueva");

  return { success: true as const, id: data.id };
}

const updateClientSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2, "El nombre es obligatorio").max(120),
  phone: z.string().max(30).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function updateClient(
  input: z.infer<typeof updateClientSchema>
): Promise<ActionResult> {
  const parsed = updateClientSchema.parse(input);
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
      name: parsed.name.trim(),
      phone: parsed.phone?.trim() || null,
      notes: parsed.notes?.trim() || null,
    })
    .eq("id", parsed.id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${parsed.id}`);
  return { success: true };
}

export async function deleteClient(id: string): Promise<ActionResult> {
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
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/clientes");
  return { success: true };
}