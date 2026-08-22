"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  dbErrorMessage,
  zodMessage,
  type ActionResult,
} from "@/lib/validation";

const CATEGORIES = ["ROPA", "CALZADO", "PERFUME", "OTRO"] as const;

/**
 * El inventario es a propósito mínimo: nombre, categoría y cantidad.
 *
 * `products.stock` NO se escribe desde aquí: lo deriva un trigger de la suma
 * de movimientos vivos (ver supabase/schema.sql §19). Esta capa solo inserta
 * movimientos, igual que con los abonos.
 */

function revalidateInventoryViews() {
  revalidatePath("/inventario");
  revalidatePath("/ventas/nueva");
  revalidatePath("/papelera");
}

const nameSchema = z
  .string()
  .trim()
  .min(2, "Ponle un nombre al producto")
  .max(80, "Nombre muy largo");

const createProductSchema = z.object({
  name: nameSchema,
  category: z.enum(CATEGORIES).default("OTRO"),
  initialStock: z.coerce
    .number({ message: "Cantidad inválida" })
    .int("La cantidad debe ser un número entero")
    .min(0, "No puede ser negativa")
    .max(1_000_000, "Cantidad demasiado grande")
    .default(0),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export async function createProduct(
  input: CreateProductInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: zodMessage(parsed.error) };
  }
  const values = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { data, error } = await supabase
    .from("products")
    .insert({
      user_id: user.id,
      name: values.name,
      category: values.category,
    })
    .select("id")
    .single();

  if (error || !data) {
    // El índice único va sobre lower(btrim(name)) por tienda.
    if (error?.code === "23505") {
      return { success: false, error: `Ya tienes un producto "${values.name}"` };
    }
    return {
      success: false,
      error: error ? dbErrorMessage(error.message) : "No se pudo crear el producto",
    };
  }

  if (values.initialStock > 0) {
    const { error: movementError } = await supabase
      .from("stock_movements")
      .insert({
        user_id: user.id,
        product_id: data.id,
        kind: "ENTRADA",
        quantity: values.initialStock,
        notes: "Carga inicial",
      });

    if (movementError) {
      return { success: false, error: dbErrorMessage(movementError.message) };
    }
  }

  revalidateInventoryViews();
  return { success: true, id: data.id };
}

const updateProductSchema = z.object({
  id: z.string().uuid(),
  name: nameSchema,
  category: z.enum(CATEGORIES),
});

export async function updateProduct(
  input: z.infer<typeof updateProductSchema>
): Promise<ActionResult> {
  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: zodMessage(parsed.error) };
  }
  const values = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const { error } = await supabase
    .from("products")
    .update({ name: values.name, category: values.category })
    .eq("id", values.id)
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: `Ya tienes un producto "${values.name}"` };
    }
    return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidateInventoryViews();
  return { success: true };
}

// ------------------------------------------------------------------
// Movimientos de stock
// ------------------------------------------------------------------

const moveSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce
    .number({ message: "Cantidad inválida" })
    .int("La cantidad debe ser un número entero")
    .positive("Tiene que ser mayor a 0")
    .max(1_000_000, "Cantidad demasiado grande"),
  notes: z.string().trim().max(200).optional().nullable(),
});

export type MoveStockInput = z.infer<typeof moveSchema>;

async function currentStock(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  productId: string
): Promise<number | null> {
  const { data } = await supabase
    .from("products")
    .select("stock")
    .eq("id", productId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  return data ? Number(data.stock) : null;
}

/** Entró mercancía: sumas unidades. */
export async function addStock(
  input: MoveStockInput
): Promise<ActionResult<{ stock: number }>> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: zodMessage(parsed.error) };
  }
  const values = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const stock = await currentStock(supabase, user.id, values.productId);
  if (stock === null) {
    return { success: false, error: "Producto no encontrado" };
  }

  const { error } = await supabase.from("stock_movements").insert({
    user_id: user.id,
    product_id: values.productId,
    kind: "ENTRADA",
    quantity: values.quantity,
    notes: values.notes || null,
  });

  if (error) {
    return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidateInventoryViews();
  return { success: true, stock: stock + values.quantity };
}

/** Salió sin venderse: se dañó, se regaló, uso personal. */
export async function removeStock(
  input: MoveStockInput
): Promise<ActionResult<{ stock: number }>> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: zodMessage(parsed.error) };
  }
  const values = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const stock = await currentStock(supabase, user.id, values.productId);
  if (stock === null) {
    return { success: false, error: "Producto no encontrado" };
  }

  if (values.quantity > stock) {
    return {
      success: false,
      error:
        stock <= 0
          ? "No te queda nada de este producto"
          : `Solo tienes ${stock}`,
    };
  }

  const { error } = await supabase.from("stock_movements").insert({
    user_id: user.id,
    product_id: values.productId,
    kind: "SALIDA",
    quantity: -values.quantity,
    notes: values.notes || null,
  });

  if (error) {
    return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidateInventoryViews();
  return { success: true, stock: stock - values.quantity };
}

const setStockSchema = z.object({
  productId: z.string().uuid(),
  target: z.coerce
    .number({ message: "Cantidad inválida" })
    .int("La cantidad debe ser un número entero")
    .min(0, "No puede ser negativa")
    .max(1_000_000, "Cantidad demasiado grande"),
  notes: z.string().trim().max(200).optional().nullable(),
});

/** Contaste y eran otras: deja el stock en el número exacto que digas. */
export async function setStock(
  input: z.infer<typeof setStockSchema>
): Promise<ActionResult<{ stock: number }>> {
  const parsed = setStockSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: zodMessage(parsed.error) };
  }
  const values = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const stock = await currentStock(supabase, user.id, values.productId);
  if (stock === null) {
    return { success: false, error: "Producto no encontrado" };
  }

  const delta = values.target - stock;
  if (delta === 0) {
    return { success: true, stock };
  }

  const { error } = await supabase.from("stock_movements").insert({
    user_id: user.id,
    product_id: values.productId,
    kind: "AJUSTE",
    quantity: delta,
    notes: values.notes || `Corregido de ${stock} a ${values.target}`,
  });

  if (error) {
    return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidateInventoryViews();
  return { success: true, stock: values.target };
}

// ------------------------------------------------------------------
// Papelera de productos
// ------------------------------------------------------------------

export async function deleteProduct(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  const now = new Date().toISOString();

  // El producto primero: con él en papelera, borrar sus movimientos no
  // dispara el recálculo y la cifra queda congelada.
  const { error } = await supabase
    .from("products")
    .update({ deleted_at: now })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (error) {
    return { success: false, error: dbErrorMessage(error.message) };
  }

  await supabase
    .from("stock_movements")
    .update({ deleted_at: now, deleted_via: "product" })
    .eq("product_id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  revalidateInventoryViews();
  return { success: true };
}

export async function restoreProduct(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  // Solo los movimientos que cayeron con este producto.
  await supabase
    .from("stock_movements")
    .update({ deleted_at: null, deleted_via: null })
    .eq("product_id", id)
    .eq("user_id", user.id)
    .eq("deleted_via", "product");

  const { error } = await supabase
    .from("products")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        error: "Ya creaste otro producto con ese nombre. Renómbralo primero.",
      };
    }
    return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidateInventoryViews();
  return { success: true };
}

export async function purgeProduct(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  // Borrado definitivo: la FK en cascada elimina sus movimientos.
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidatePath("/papelera");
  return { success: true };
}
