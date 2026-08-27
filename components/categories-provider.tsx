"use client";

import * as React from "react";

import { findCategory, type Category } from "@/lib/categories";

/**
 * El catálogo de categorías, disponible en toda la app.
 *
 * Se pasa por contexto y no como propiedad porque lo necesitan ocho
 * componentes repartidos por cinco pantallas: enhebrarlo a mano por cada
 * capa ensuciaría media aplicación para entregar el mismo dato. El layout
 * lo lee una vez —ya cacheado— y lo deja aquí.
 */

interface CategoriesValue {
  /** Todas, incluidas las apagadas: lo ya guardado tiene que poder pintarse. */
  all: Category[];
  /** Solo las encendidas, que son las que se ofrecen al registrar. */
  selectable: Category[];
  /** Nunca falla: si el slug no está, devuelve algo legible. */
  get: (slug: string | null | undefined) => Category;
  label: (slug: string | null | undefined) => string;
}

const CategoriesContext = React.createContext<CategoriesValue | null>(null);

export function CategoriesProvider({
  categories,
  children,
}: {
  categories: Category[];
  children: React.ReactNode;
}) {
  const value = React.useMemo<CategoriesValue>(() => {
    const get = (slug: string | null | undefined) =>
      findCategory(categories, slug);
    return {
      all: categories,
      selectable: categories.filter((c) => c.is_active),
      get,
      label: (slug) => get(slug).label,
    };
  }, [categories]);

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

/**
 * Fuera del proveedor devuelve un catálogo vacío en vez de reventar: así
 * un componente suelto en una prueba o en Storybook sigue montando.
 */
export function useCategories(): CategoriesValue {
  const ctx = React.useContext(CategoriesContext);
  if (ctx) return ctx;

  const vacio: Category[] = [];
  const get = (slug: string | null | undefined) => findCategory(vacio, slug);
  return { all: vacio, selectable: vacio, get, label: (s) => get(s).label };
}
