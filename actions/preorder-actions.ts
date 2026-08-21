"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PreorderStatus } from "@/types/database.types";

const CATEGORIES = ["ROPA", "CALZADO", "PERFUME", "OTRO"] as const;
const STATUSES = ["PENDENT", "ORDERED", "DELIVERED", "CANCELLED"] as const;

const createPreorderSchema = z.object({
  productName: z
    .string()
    .min(2, "Describe el producto")
    .max(300, "Descripción muy larga"),
  category: z.enum(CATEGORIES).default("PERFUME"),
  clientId: z.string().uuid().optional().nullable(),
  clientNameRaw: z.string().max(120).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(1000).default(1),
  estimatedPrice: z.coerce
    .number()
    .min(0)
    .max(99999999)
    .optional()
    .nullable(),
  status: z.enum(STATUSES).default("PENDENT"),
  notes: z.string().max(500).optional().nullable(),
});

export type CreatePreorderInput = z.infer<typeof createPreorderSchema>;

export async function createPreorder(input: CreatePreorderInput) {
  const parsed = createPreorderSchema.parse(input);
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { data, error } = await supabase
    .from("preorders")
    .insert({
      user_id: user.id,
      product_name: parsed.productName.trim(),
      category: parsed.category,
      client_id: parsed.clientId || null,
      client_name_raw: parsed.clientNameRaw?.trim() || null,
      quantity: parsed.quantity,
      estimated_price: parsed.estimatedPrice ?? null,
      status: parsed.status,
      notes: parsed.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/pedidos");
  if (parsed.clientId) {
    revalidatePath(`/clientes/${parsed.clientId}`);
  }

  return { success: true, id: data.id };
}

export async function updatePreorderStatus(id: string, status: PreorderStatus) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { error } = await supabase
    .from("preorders")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/pedidos");
  return { success: true };
}

const updatePreorderSchema = z.object({
  id: z.string().uuid(),
  productName: z.string().min(2).max(300),
  category: z.enum(CATEGORIES),
  clientId: z.string().uuid().optional().nullable(),
  clientNameRaw: z.string().max(120).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(1000),
  estimatedPrice: z.coerce.number().min(0).max(99999999).optional().nullable(),
  status: z.enum(STATUSES),
  notes: z.string().max(500).optional().nullable(),
});

export async function updatePreorder(input: z.infer<typeof updatePreorderSchema>) {
  const parsed = updatePreorderSchema.parse(input);
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { error } = await supabase
    .from("preorders")
    .update({
      product_name: parsed.productName.trim(),
      category: parsed.category,
      client_id: parsed.clientId || null,
      client_name_raw: parsed.clientNameRaw?.trim() || null,
      quantity: parsed.quantity,
      estimated_price: parsed.estimatedPrice ?? null,
      status: parsed.status,
      notes: parsed.notes?.trim() || null,
    })
    .eq("id", parsed.id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/pedidos");
  if (parsed.clientId) {
    revalidatePath(`/clientes/${parsed.clientId}`);
  }

  return { success: true };
}

export async function deletePreorder(id: string) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { error } = await supabase
    .from("preorders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/pedidos");
  revalidatePath("/papelera");
  return { success: true };
}

export async function restorePreorder(id: string) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { error } = await supabase
    .from("preorders")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/pedidos");
  revalidatePath("/papelera");
  return { success: true };
}

export async function purgePreorder(id: string) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { error } = await supabase
    .from("preorders")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/papelera");
  return { success: true };
}