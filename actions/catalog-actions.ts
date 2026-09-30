"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { puedeVerCatalogo } from "@/lib/catalog-access";
import { BUCKET_DE_CATALOGO } from "@/lib/images";
import { dbErrorMessage, zodMessage, type ActionResult } from "@/lib/validation";

/*
 * El catálogo es una función a la medida de una cuenta. Además del aislamiento
 * por user_id de la base, cada acción confirma que quien llama es una cuenta
 * autorizada: así ni una llamada armada a mano desde otra cuenta escribe aquí.
 */
async function cuentaDeCatalogo(): Promise<
  | { supabase: ReturnType<typeof createClient>; userId: string }
  | { error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { error: "No autorizado" };
  if (!puedeVerCatalogo(user.email)) return { error: "No autorizado" };

  return { supabase, userId: user.id };
}

const categorySchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9_]{2,32}$/, "Categoría inválida");

const productSchema = z.object({
  name: z
    .string()
    .min(2, "Escribe el nombre del producto")
    .max(120, "Nombre muy largo"),
  category: categorySchema.default("CALZADO"),
  price: z.coerce
    .number({ message: "Precio inválido" })
    .positive("El precio debe ser mayor a 0")
    .max(99999999, "El precio es demasiado grande"),
  note: z.string().max(200, "Nota muy larga").optional().nullable(),
});

export type CatalogProductInput = z.infer<typeof productSchema>;

function revalidarCatalogo() {
  revalidatePath("/catalogo");
}

export async function createCatalogProduct(
  input: CatalogProductInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: zodMessage(parsed.error) };

  const cuenta = await cuentaDeCatalogo();
  if ("error" in cuenta) return { success: false, error: cuenta.error };
  const { supabase, userId } = cuenta;

  const { data, error } = await supabase
    .from("catalog_products")
    .insert({
      user_id: userId,
      name: parsed.data.name.trim(),
      category: parsed.data.category,
      price: parsed.data.price,
      note: parsed.data.note?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error ? dbErrorMessage(error.message) : "No se pudo guardar el producto",
    };
  }

  revalidarCatalogo();
  return { success: true, id: data.id };
}

const updateSchema = productSchema.extend({ id: z.string().uuid() });

export async function updateCatalogProduct(
  input: z.infer<typeof updateSchema>
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: zodMessage(parsed.error) };

  const cuenta = await cuentaDeCatalogo();
  if ("error" in cuenta) return { success: false, error: cuenta.error };
  const { supabase, userId } = cuenta;

  const { error } = await supabase
    .from("catalog_products")
    .update({
      name: parsed.data.name.trim(),
      category: parsed.data.category,
      price: parsed.data.price,
      note: parsed.data.note?.trim() || null,
    })
    .eq("id", parsed.data.id)
    .eq("user_id", userId);

  if (error) return { success: false, error: dbErrorMessage(error.message) };

  revalidarCatalogo();
  return { success: true };
}

/**
 * Borra un producto del catálogo, y de paso su imagen del depósito.
 *
 * Sin papelera: el catálogo es material que se rehace fácil, y guardar
 * imágenes borradas ocuparía el poco espacio del plan gratuito. Primero se
 * quita el archivo y después la fila; si el archivo falla, igual se borra la
 * fila —un archivo huérfano se puede limpiar, una fila que no se deja borrar
 * es la que molesta—.
 */
export async function deleteCatalogProduct(id: string): Promise<ActionResult> {
  const cuenta = await cuentaDeCatalogo();
  if ("error" in cuenta) return { success: false, error: cuenta.error };
  const { supabase, userId } = cuenta;

  const { data: producto } = await supabase
    .from("catalog_products")
    .select("id, image_path")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!producto) return { success: false, error: "Ese producto ya no existe" };

  if (producto.image_path) {
    await supabase.storage.from(BUCKET_DE_CATALOGO).remove([producto.image_path]);
  }

  const { error } = await supabase
    .from("catalog_products")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return { success: false, error: dbErrorMessage(error.message) };

  revalidarCatalogo();
  return { success: true };
}

/**
 * Apunta (o quita) la ruta de la imagen de un producto.
 *
 * Va aparte del alta, igual que en pedidos: la ruta lleva el id del producto
 * y ese id no existe hasta que la fila está creada. El archivo lo sube el
 * navegador directo al depósito; aquí solo se guarda dónde quedó.
 */
export async function setCatalogImage(
  id: string,
  imagePath: string | null
): Promise<ActionResult> {
  const cuenta = await cuentaDeCatalogo();
  if ("error" in cuenta) return { success: false, error: cuenta.error };
  const { supabase, userId } = cuenta;

  // Que la ruta sea de SU carpeta. El depósito ya lo impide al subir, pero
  // esta columna se puede escribir sin subir nada.
  if (imagePath && !imagePath.startsWith(`${userId}/`)) {
    return { success: false, error: "Ruta de imagen inválida" };
  }

  const { error } = await supabase
    .from("catalog_products")
    .update({ image_path: imagePath })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return { success: false, error: dbErrorMessage(error.message) };

  revalidarCatalogo();
  return { success: true };
}
