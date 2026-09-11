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

/**
 * Guarda (o quita) la ruta de la foto de un pedido.
 *
 * Va separada del alta a propósito: la ruta de la foto lleva dentro el id
 * del pedido, y ese id no existe hasta que la fila está creada. Así que
 * el orden es guardar el pedido, subir el archivo, y apuntar aquí dónde
 * quedó. El archivo lo sube el navegador directo al depósito —no pasa por
 * este servidor— porque una foto de varios megas ida y vuelta por una
 * acción de servidor es lento y además no hace falta: las reglas del
 * depósito ya impiden escribir en la carpeta de otra tienda.
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

  // Que la ruta sea de SU carpeta. La política del depósito ya lo impide
  // al subir, pero esta columna se puede escribir sin subir nada, y una
  // ruta ajena aquí serviría para espiar la foto de otra tienda.
  if (imagePath && !imagePath.startsWith(`${user.id}/`)) {
    return { success: false, error: "Ruta de foto inválida" };
  }

  const { error } = await supabase
    .from("preorders")
    .update({ image_path: imagePath })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/pedidos");
  return { success: true };
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


const convertPreorderSchema = z.object({
  preorderId: z.string().uuid(),
  clientId: z.string().uuid("Selecciona un cliente"),
  itemDescription: z
    .string()
    .min(3, "Describe la mercancía")
    .max(300, "Descripción muy larga"),
  totalAmount: z.coerce
    .number({ message: "Monto inválido" })
    .positive("El monto debe ser mayor a 0"),
  installmentsCount: z.coerce
    .number({ message: "Cuotas inválidas" })
    .int("Las cuotas deben ser un número entero")
    .min(1, "Al menos 1 cuota")
    .max(36, "Máximo 36 cuotas"),
  notes: z.string().max(500).optional().nullable(),
});

export type ConvertPreorderInput = z.infer<typeof convertPreorderSchema>;

/**
 * Convierte un pedido en una venta.
 *
 * LAS DOS ESCRITURAS VAN JUNTAS, Y POR ESO ESTO LLAMA A LA BASE
 *
 * Hay que crear la venta Y marcar el pedido. Hechas por separado, si la
 * segunda falla queda una venta creada y un pedido que todavía enseña el
 * botón de convertir: el siguiente clic crea una SEGUNDA venta y el
 * cliente aparece debiendo el doble. La función `convertir_pedido_en_venta`
 * hace las dos dentro de una transacción, con la fila del pedido
 * bloqueada, así que ni dos clics seguidos ni el teléfono y la
 * computadora a la vez pueden duplicarla.
 *
 * Eso mismo es lo que hace que la app móvil no tenga que repetir nada:
 * llama a la misma función.
 *
 * Aquí arriba solo queda lo que la base no puede hacer: validar la
 * entrada con mensajes en castellano y refrescar las páginas que ahora
 * enseñan algo distinto.
 */
export async function convertPreorderToSale(input: ConvertPreorderInput) {
  const parsed = convertPreorderSchema.parse(input);
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { data, error } = await supabase.rpc("convertir_pedido_en_venta", {
    p_pedido: parsed.preorderId,
    p_cliente: parsed.clientId,
    p_descripcion: parsed.itemDescription.trim(),
    p_total: parsed.totalAmount,
    p_cuotas: parsed.installmentsCount,
    p_nota: parsed.notes?.trim() || null,
  });

  if (error) {
    // Los mensajes de la función ya vienen en castellano y pensados para
    // el dueño de la tienda ("Este pedido ya se convirtió en venta"). Se
    // pasan tal cual; solo se traduce lo que viene de Postgres en crudo.
    return { success: false, error: mensajeDeBase(error.message) };
  }

  revalidatePath("/");
  revalidatePath("/pedidos");
  revalidatePath("/ventas");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${parsed.clientId}`);

  return { success: true, saleId: data as string };
}

function mensajeDeBase(bruto: string): string {
  const texto = bruto.toLowerCase();
  if (texto.includes("jwt") || texto.includes("expired")) {
    return "Se venció la sesión. Vuelve a entrar.";
  }
  if (texto.includes("could not find the function")) {
    // El caso real: la migración de pedidos todavía no se corrió.
    return "Falta correr la migración de pedidos en la base de datos.";
  }
  if (texto.includes("permission denied") || texto.includes("row-level security")) {
    return "No tienes permiso para esto.";
  }
  if (texto.includes("fetch") || texto.includes("network")) {
    return "Sin conexión. Intenta de nuevo.";
  }
  return bruto;
}
