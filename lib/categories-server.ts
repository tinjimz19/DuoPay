import { cache } from "react";

import { DEFAULT_CATEGORY_COLOR, type Category } from "@/lib/categories";
import { createClient } from "@/lib/supabase/server";

/** Lo que había antes del catálogo, por si la tabla todavía no existe. */
const SEMILLA: Category[] = [
  { slug: "ROPA", label: "Ropa", color: "indigo", sort_order: 0, is_active: true },
  { slug: "CALZADO", label: "Calzado", color: "violet", sort_order: 1, is_active: true },
  { slug: "PERFUME", label: "Perfume", color: "rose", sort_order: 2, is_active: true },
  { slug: "OTRO", label: "Otro", color: DEFAULT_CATEGORY_COLOR, sort_order: 3, is_active: true },
];

/**
 * El catálogo completo, una sola vez por render.
 *
 * Va envuelto en `cache()` de React porque lo piden el layout, varias
 * páginas y el panel del admin: sin esto serían cinco consultas iguales.
 *
 * Si la consulta falla —típicamente porque todavía no se corrió
 * patch-05— devuelve las cuatro de siempre en vez de dejar la app sin
 * categorías. Una tienda a medio migrar sigue pudiendo vender.
 */
export const allCategories = cache(async (): Promise<Category[]> => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return SEMILLA;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("slug, label, color, sort_order, is_active")
    .order("sort_order")
    .order("slug");

  if (error || !data || data.length === 0) return SEMILLA;
  return data as Category[];
});

/**
 * Las que se pueden elegir al registrar algo nuevo.
 *
 * Las apagadas siguen existiendo para lo ya guardado —una venta vieja de
 * "Perfume" tiene que seguir diciendo Perfume— pero no se ofrecen.
 */
export const selectableCategories = cache(async (): Promise<Category[]> => {
  const todas = await allCategories();
  return todas.filter((c) => c.is_active);
});
