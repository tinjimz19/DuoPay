"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ensureClient } from "@/lib/clients-server";
import {
  dbErrorMessage,
  newClientSchema,
  optionalUuid,
  zodMessage,
} from "@/lib/validation";
import type { PreorderStatus } from "@/types/database.types";

/*
 * La categoría ya no es una lista fija: la administra el super admin. Se
 * valida el FORMATO aquí y la EXISTENCIA la impone la clave foránea de la
 * base, que es la única que puede saber el catálogo del momento.
 */
const categorySchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9_]{2,32}$/, "Categoría inválida");
const STATUSES = ["PENDENT", "ORDERED", "DELIVERED", "CANCELLED"] as const;

const createPreorderSchema = z.object({
  productName: z
    .string()
    .min(2, "Describe el producto")
    .max(300, "Descripción muy larga"),
  category: categorySchema.default("PERFUME"),
  clientId: optionalUuid,
  clientNameRaw: z.string().max(120).optional().nullable(),
  // Alta de cliente desde este mismo formulario.
  newClient: newClientSchema.optional().nullable(),
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
  const parsedInput = createPreorderSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: zodMessage(parsedInput.error) };
  }
  const parsed = parsedInput.data;
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  let clientId = parsed.clientId;
  if (!clientId && parsed.newClient) {
    const created = await ensureClient(supabase, user.id, parsed.newClient);
    if ("error" in created) {
      return { success: false, error: created.error };
    }
    clientId = created.id;
  }

  const { data, error } = await supabase
    .from("preorders")
    .insert({
      user_id: user.id,
      product_name: parsed.productName.trim(),
      category: parsed.category,
      client_id: clientId,
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
  revalidatePath("/clientes");
  revalidatePath("/ventas/nueva");
  if (clientId) {
    revalidatePath(`/clientes/${clientId}`);
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
  category: categorySchema,
  clientId: optionalUuid,
  clientNameRaw: z.string().max(120).optional().nullable(),
  newClient: newClientSchema.optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(1000),
  estimatedPrice: z.coerce.number().min(0).max(99999999).optional().nullable(),
  status: z.enum(STATUSES),
  notes: z.string().max(500).optional().nullable(),
});

export async function updatePreorder(input: z.infer<typeof updatePreorderSchema>) {
  const parsedInput = updatePreorderSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: zodMessage(parsedInput.error) };
  }
  const parsed = parsedInput.data;
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  let clientId = parsed.clientId;
  if (!clientId && parsed.newClient) {
    const created = await ensureClient(supabase, user.id, parsed.newClient);
    if ("error" in created) {
      return { success: false, error: created.error };
    }
    clientId = created.id;
  }

  const { error } = await supabase
    .from("preorders")
    .update({
      product_name: parsed.productName.trim(),
      category: parsed.category,
      client_id: clientId,
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
  revalidatePath("/clientes");
  if (clientId) {
    revalidatePath(`/clientes/${clientId}`);
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


/**
 * Guarda (o quita) la ruta de la foto de un pedido.
 *
 * Va separada del alta a propósito: la ruta lleva dentro el id del pedido y
 * ese id no existe hasta que la fila está creada. El orden es guardar el
 * pedido, subir el archivo, y apuntar aquí dónde quedó.
 *
 * El archivo lo sube el navegador directo al depósito, sin pasar por este
 * servidor: una foto de varios megas ida y vuelta por una acción es lento, y
 * no hace falta, porque la política del depósito ya impide escribir en la
 * carpeta de otra tienda.
 */
export async function setPreorderImage(id: string, imagePath: string | null) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  // Que la ruta sea de SU carpeta. El depósito ya lo impide al subir, pero
  // esta columna se puede escribir sin subir nada, y una ruta ajena aquí
  // serviría para mirar la foto de otra tienda.
  if (imagePath && !imagePath.startsWith(`${user.id}/`)) {
    return { success: false, error: "Ruta de foto inválida" };
  }

  const { error } = await supabase
    .from("preorders")
    .update({ image_path: imagePath })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidatePath("/pedidos");
  return { success: true };
}

const convertPreorderSchema = z.object({
  preorderId: z.string().uuid(),
  clientId: optionalUuid,
  // Igual que en el alta: el cliente se puede crear desde aquí mismo.
  newClient: newClientSchema.optional().nullable(),
  itemDescription: z
    .string()
    .min(3, "Describe la mercancía")
    .max(300, "Descripción muy larga"),
  totalAmount: z.coerce
    .number({ message: "Monto inválido" })
    .positive("El monto debe ser mayor a 0")
    .max(99999999, "El monto es demasiado grande"),
  installmentsCount: z.coerce
    .number({ message: "Cuotas inválidas" })
    .int("Las cuotas deben ser un número entero")
    .min(1, "Al menos 1 cuota")
    .max(36, "Máximo 36 cuotas"),
  notes: z.string().max(500).optional().nullable(),
});

export type ConvertPreorderInput = z.infer<typeof convertPreorderSchema>;

/**
 * Convierte un pedido en venta.
 *
 * LAS DOS ESCRITURAS VAN JUNTAS, Y POR ESO ESTO LLAMA A LA BASE
 *
 * Hay que crear la venta Y marcar el pedido. Hechas por separado, si la
 * segunda falla queda una venta creada y un pedido que todavía enseña el
 * botón: el siguiente clic crea una SEGUNDA venta y el cliente aparece
 * debiendo el doble. `convertir_pedido_en_venta` hace las dos dentro de una
 * transacción, con la fila del pedido bloqueada, así que ni dos clics
 * seguidos ni el teléfono y la computadora a la vez pueden duplicarla.
 *
 * De paso, es lo que evita repetir la lógica en la app móvil, que habla con
 * la base directamente y no tiene servidor propio.
 *
 * Aquí arriba queda solo lo que la base no puede hacer: dar de alta al
 * cliente si hace falta, validar con mensajes en castellano, y refrescar las
 * páginas que ahora enseñan algo distinto.
 */
export async function convertPreorderToSale(input: ConvertPreorderInput) {
  const parsedInput = convertPreorderSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: zodMessage(parsedInput.error) };
  }
  const parsed = parsedInput.data;
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  let clientId = parsed.clientId;
  if (!clientId && parsed.newClient) {
    const created = await ensureClient(supabase, user.id, parsed.newClient);
    if ("error" in created) {
      return { success: false, error: created.error };
    }
    clientId = created.id;
  }

  if (!clientId) {
    return { success: false, error: "Selecciona un cliente" };
  }

  const { data, error } = await supabase.rpc("convertir_pedido_en_venta", {
    p_pedido: parsed.preorderId,
    p_cliente: clientId,
    p_descripcion: parsed.itemDescription.trim(),
    p_total: parsed.totalAmount,
    p_cuotas: parsed.installmentsCount,
    p_nota: parsed.notes?.trim() || null,
  });

  if (error) {
    // Los mensajes de la función ya vienen en castellano y pensados para la
    // tienda ("Este pedido ya se convirtió en venta"), así que pasan tal
    // cual. `dbErrorMessage` solo caza el caso de la migración sin correr.
    return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidatePath("/");
  revalidatePath("/pedidos");
  revalidatePath("/ventas");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);

  return { success: true, saleId: data as string };
}
