"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  CATEGORY_COLORS,
  isValidCategorySlug,
  slugifyCategory,
} from "@/lib/categories";
import {
  dbErrorMessage,
  zodMessage,
  type ActionResult,
} from "@/lib/validation";

/**
 * El catálogo de categorías lo administra solo el super admin.
 *
 * Las políticas RLS ya lo impiden desde la base (ver patch-05), pero se
 * comprueba también aquí para poder devolver un mensaje en castellano en
 * vez de un error crudo de Postgres.
 */

const COLORS = Object.keys(CATEGORY_COLORS) as [string, ...string[]];

const categorySchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 letras")
    .max(40, "Nombre muy largo"),
  color: z.enum(COLORS).default("slate"),
});

const updateSchema = categorySchema.extend({
  slug: z.string().refine(isValidCategorySlug, "Categoría inválida"),
  isActive: z.boolean().optional(),
});

function revalidar() {
  // El catálogo se lee en el layout, así que cambia en toda la app.
  revalidatePath("/", "layout");
}

async function requireSuperAdmin() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { supabase, ok: false as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, ok: profile?.role === "super_admin" };
}

export async function createCategory(input: {
  label: string;
  color: string;
}): Promise<ActionResult<{ slug: string }>> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: zodMessage(parsed.error) };
  }

  const slug = slugifyCategory(parsed.data.label);
  if (!isValidCategorySlug(slug)) {
    return {
      success: false,
      error: "Ese nombre no sirve como categoría. Usa letras y números.",
    };
  }

  const { supabase, ok } = await requireSuperAdmin();
  if (!ok) return { success: false, error: "Solo el super admin puede hacer esto" };

  const { data: existente } = await supabase
    .from("categories")
    .select("label")
    .eq("slug", slug)
    .maybeSingle();

  if (existente) {
    return {
      success: false,
      error: `Ya existe una categoría "${existente.label}".`,
    };
  }

  // Va al final de la lista.
  const { count } = await supabase
    .from("categories")
    .select("slug", { count: "exact", head: true });

  const { error } = await supabase.from("categories").insert({
    slug,
    label: parsed.data.label,
    color: parsed.data.color,
    sort_order: count ?? 0,
  });

  if (error) return { success: false, error: dbErrorMessage(error.message) };
  revalidar();
  return { success: true, slug };
}

export async function updateCategory(input: {
  slug: string;
  label: string;
  color: string;
  isActive?: boolean;
}): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: zodMessage(parsed.error) };
  }

  const { supabase, ok } = await requireSuperAdmin();
  if (!ok) return { success: false, error: "Solo el super admin puede hacer esto" };

  // El slug NO se toca: es lo que quedó escrito en cada venta guardada.
  const { error } = await supabase
    .from("categories")
    .update({
      label: parsed.data.label,
      color: parsed.data.color,
      ...(parsed.data.isActive === undefined
        ? {}
        : { is_active: parsed.data.isActive }),
    })
    .eq("slug", parsed.data.slug);

  if (error) return { success: false, error: dbErrorMessage(error.message) };
  revalidar();
  return { success: true };
}

export async function setCategoryActive(
  slug: string,
  active: boolean
): Promise<ActionResult> {
  if (!isValidCategorySlug(slug)) {
    return { success: false, error: "Categoría inválida" };
  }
  const { supabase, ok } = await requireSuperAdmin();
  if (!ok) return { success: false, error: "Solo el super admin puede hacer esto" };

  const { error } = await supabase
    .from("categories")
    .update({ is_active: active })
    .eq("slug", slug);

  if (error) return { success: false, error: dbErrorMessage(error.message) };
  revalidar();
  return { success: true };
}

/** Sube o baja una categoría en la lista, intercambiándola con su vecina. */
export async function moveCategory(
  slug: string,
  direction: "up" | "down"
): Promise<ActionResult> {
  if (!isValidCategorySlug(slug)) {
    return { success: false, error: "Categoría inválida" };
  }
  const { supabase, ok } = await requireSuperAdmin();
  if (!ok) return { success: false, error: "Solo el super admin puede hacer esto" };

  const { data: todas, error: leer } = await supabase
    .from("categories")
    .select("slug, sort_order")
    .order("sort_order")
    .order("slug");

  if (leer || !todas) {
    return { success: false, error: "No se pudo leer el catálogo" };
  }

  const i = todas.findIndex((c) => c.slug === slug);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= todas.length) {
    return { success: true }; // ya está en la punta, no hay nada que hacer
  }

  // Se reescribe el orden entero: los `sort_order` heredados pueden venir
  // repetidos o con huecos, y así quedan siempre 0,1,2,3…
  const orden = todas.map((c) => c.slug);
  [orden[i], orden[j]] = [orden[j], orden[i]];

  for (let k = 0; k < orden.length; k++) {
    const { error } = await supabase
      .from("categories")
      .update({ sort_order: k })
      .eq("slug", orden[k]);
    if (error) return { success: false, error: dbErrorMessage(error.message) };
  }

  revalidar();
  return { success: true };
}

/**
 * Borrar de verdad, y solo si nadie la usa.
 *
 * La clave foránea de la base ya lo impide; aquí se traduce ese rechazo a
 * algo que se entienda, y se sugiere apagarla, que casi siempre es lo que
 * la persona quería.
 */
export async function deleteCategory(slug: string): Promise<ActionResult> {
  if (!isValidCategorySlug(slug)) {
    return { success: false, error: "Categoría inválida" };
  }
  const { supabase, ok } = await requireSuperAdmin();
  if (!ok) return { success: false, error: "Solo el super admin puede hacer esto" };

  const { error } = await supabase.from("categories").delete().eq("slug", slug);

  if (error) {
    const esFk =
      error.code === "23503" ||
      error.message.toLowerCase().includes("foreign key") ||
      error.message.toLowerCase().includes("violates");
    return {
      success: false,
      error: esFk
        ? "Hay ventas, pedidos o productos con esta categoría. Apágala en vez de borrarla: deja de ofrecerse y lo viejo se sigue viendo bien."
        : dbErrorMessage(error.message),
    };
  }

  revalidar();
  return { success: true };
}
