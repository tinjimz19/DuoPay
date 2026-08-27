/**
 * El catálogo de categorías.
 *
 * Antes eran cuatro valores escritos dentro de un ENUM de Postgres, así
 * que agregar "Repuestos" o "Comida" pedía cambiar el esquema. Ahora son
 * filas de una tabla que administra el super admin y que todas las
 * tiendas leen.
 *
 * El `slug` es lo que quedó escrito en cada venta vieja, así que es la
 * clave y no se edita; el nombre visible sí.
 */

export interface Category {
  slug: string;
  label: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

/**
 * Los colores se guardan por nombre, no como clases de CSS.
 *
 * Tailwind solo incluye en el CSS final las clases que encuentra escritas
 * en el código: una clase armada al vuelo desde la base de datos no
 * existiría en producción y la insignia saldría sin color. Por eso la
 * tabla guarda "amber" y la traducción vive aquí, completa y literal.
 */
export const CATEGORY_COLORS = {
  indigo: {
    label: "Índigo",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
    dot: "bg-indigo-500",
  },
  violet: {
    label: "Violeta",
    badge: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
    dot: "bg-violet-500",
  },
  rose: {
    label: "Rosa",
    badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
    dot: "bg-rose-500",
  },
  pink: {
    label: "Fucsia",
    badge: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800",
    dot: "bg-pink-500",
  },
  amber: {
    label: "Ámbar",
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  orange: {
    label: "Naranja",
    badge: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
    dot: "bg-orange-500",
  },
  emerald: {
    label: "Verde",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  teal: {
    label: "Turquesa",
    badge: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
    dot: "bg-teal-500",
  },
  sky: {
    label: "Celeste",
    badge: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
    dot: "bg-sky-500",
  },
  slate: {
    label: "Gris",
    badge: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    dot: "bg-slate-400",
  },
} as const;

export type CategoryColor = keyof typeof CATEGORY_COLORS;

export const CATEGORY_COLOR_OPTIONS = (
  Object.keys(CATEGORY_COLORS) as CategoryColor[]
).map((value) => ({ value, ...CATEGORY_COLORS[value] }));

export const DEFAULT_CATEGORY_COLOR: CategoryColor = "slate";

export function categoryBadgeClass(color: string | null | undefined): string {
  const c = CATEGORY_COLORS[color as CategoryColor];
  return (c ?? CATEGORY_COLORS[DEFAULT_CATEGORY_COLOR]).badge;
}

export function categoryDotClass(color: string | null | undefined): string {
  const c = CATEGORY_COLORS[color as CategoryColor];
  return (c ?? CATEGORY_COLORS[DEFAULT_CATEGORY_COLOR]).dot;
}

/**
 * "Repuestos de moto" -> "REPUESTOS_DE_MOTO".
 *
 * Se le quitan los acentos: el slug viaja en la clave foránea y en cada
 * fila guardada, y una ñ o una tilde ahí solo trae problemas después.
 */
export function slugifyCategory(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, "N")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

/** El mismo formato que exige la base (ver patch-05). */
export function isValidCategorySlug(slug: string): boolean {
  return /^[A-Z0-9_]{2,32}$/.test(slug);
}

/**
 * Cómo mostrar una categoría que llega de la base.
 *
 * Si el catálogo no la tiene —no debería pasar, la clave foránea lo
 * impide— igual se pinta algo legible en vez de romper la pantalla.
 */
export function findCategory(
  categories: Category[],
  slug: string | null | undefined
): Category {
  const found = categories.find((c) => c.slug === slug);
  if (found) return found;
  return {
    slug: slug ?? "OTRO",
    label: slug ? prettify(slug) : "Otro",
    color: DEFAULT_CATEGORY_COLOR,
    sort_order: 999,
    is_active: false,
  };
}

function prettify(slug: string): string {
  const texto = slug.replace(/_/g, " ").toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Diccionario slug -> nombre, para pintar listas en el servidor. */
export function categoryLabelMap(categories: Category[]): Map<string, string> {
  return new Map(categories.map((c) => [c.slug, c.label]));
}
