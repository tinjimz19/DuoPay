/**
 * Aritmética de la paginación, aparte del componente para poder probarla.
 */

/** Cuántas fichas se muestran de una vez en clientes, ventas y pedidos. */
export const PAGE_SIZE = 8;

/** Cuántos números de página caben en los controles antes de recortar. */
const VENTANA = 5;

export function totalPages(count: number, pageSize: number = PAGE_SIZE): number {
  // Una lista vacía sigue siendo "página 1 de 1": así los controles nunca
  // muestran "página 1 de 0".
  return Math.max(1, Math.ceil(count / pageSize));
}

/**
 * Encierra la página pedida dentro de lo que existe.
 *
 * Hace falta porque la lista se filtra en vivo: si estás en la página 4 y el
 * buscador deja 3 resultados, sin esto la pantalla queda en blanco.
 */
export function clampPage(
  page: number,
  count: number,
  pageSize: number = PAGE_SIZE
): number {
  const max = totalPages(count, pageSize);
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), max);
}

/** El trozo de la lista que toca mostrar. */
export function pageSlice<T>(
  items: T[],
  page: number,
  pageSize: number = PAGE_SIZE
): T[] {
  const actual = clampPage(page, items.length, pageSize);
  const desde = (actual - 1) * pageSize;
  return items.slice(desde, desde + pageSize);
}

/** "9-16 de 43" — qué se está viendo, en números de persona (base 1). */
export function pageRange(
  page: number,
  count: number,
  pageSize: number = PAGE_SIZE
): { from: number; to: number } {
  if (count === 0) return { from: 0, to: 0 };
  const actual = clampPage(page, count, pageSize);
  const from = (actual - 1) * pageSize + 1;
  return { from, to: Math.min(actual * pageSize, count) };
}

/**
 * Los números de página que se dibujan, centrados en el actual.
 * Con pocas páginas salen todas; con muchas, una ventana que se desliza.
 */
export function visiblePages(
  page: number,
  count: number,
  pageSize: number = PAGE_SIZE,
  ventana: number = VENTANA
): number[] {
  const total = totalPages(count, pageSize);
  const actual = clampPage(page, count, pageSize);

  if (total <= ventana) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const mitad = Math.floor(ventana / 2);
  const fin = Math.min(total, Math.max(actual + mitad, ventana));
  const inicio = Math.max(1, fin - ventana + 1);

  return Array.from({ length: fin - inicio + 1 }, (_, i) => inicio + i);
}
