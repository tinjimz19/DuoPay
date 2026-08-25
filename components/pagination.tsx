"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  PAGE_SIZE,
  clampPage,
  pageRange,
  pageSlice,
  totalPages,
  visiblePages,
} from "@/lib/pagination";
import { cn } from "@/lib/utils";

/**
 * Paginación de listas.
 *
 * Se aplica SOBRE la lista ya filtrada, no sobre la consulta. El buscador y
 * las pestañas siguen mirando todo: si se paginara en el servidor, buscar a un
 * cliente que quedó en la página 3 no daría resultados y parecería que no
 * existe. Aquí primero se filtra todo y después se trocea lo que quedó.
 */

export interface Pagination<T> {
  page: number;
  totalPages: number;
  /** Lo que toca mostrar en esta página. */
  items: T[];
  /** Total de elementos tras filtrar. */
  count: number;
  goTo: (page: number) => void;
  /** Anclar al inicio de la lista, para volver arriba al cambiar de página. */
  topRef: React.RefObject<HTMLDivElement>;
}

export function usePagination<T>(
  items: T[],
  {
    pageSize = PAGE_SIZE,
    /** Cambia cuando cambian los filtros: al hacerlo, se vuelve a la página 1. */
    resetKey = "",
  }: { pageSize?: number; resetKey?: string } = {}
): Pagination<T> {
  const [page, setPage] = React.useState(1);
  const topRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const actual = clampPage(page, items.length, pageSize);

  const goTo = React.useCallback((next: number) => {
    setPage(next);
    // Sin esto, tocas "Siguiente" abajo del todo y te quedas abajo del todo,
    // mirando el final de la página nueva. `scroll-mt-*` en el ancla deja el
    // hueco de la cabecera fija.
    topRef.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, []);

  return {
    page: actual,
    totalPages: totalPages(items.length, pageSize),
    items: React.useMemo(
      () => pageSlice(items, actual, pageSize),
      [items, actual, pageSize]
    ),
    count: items.length,
    goTo,
    topRef,
  };
}

export function Paginacion<T>({
  pagination,
  pageSize = PAGE_SIZE,
  /** Cómo se llama lo que se lista, para el resumen y las etiquetas. */
  noun = "resultados",
}: {
  pagination: Pagination<T>;
  pageSize?: number;
  noun?: string;
}) {
  const { page, totalPages: total, count, goTo } = pagination;

  // Con una sola página los controles solo estorban.
  if (total <= 1) return null;

  const { from, to } = pageRange(page, count, pageSize);
  const numeros = visiblePages(page, count, pageSize);

  return (
    <nav
      aria-label={`Paginación de ${noun}`}
      className="flex flex-col items-center gap-2 pt-1"
    >
      <div className="flex w-full items-center justify-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={page === 1}
          onClick={() => goTo(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {numeros.map((n) => {
          const activa = n === page;
          return (
            <button
              key={n}
              type="button"
              onClick={() => goTo(n)}
              aria-label={`Página ${n}`}
              aria-current={activa ? "page" : undefined}
              className={cn(
                "h-10 min-w-10 rounded-md border px-2 text-sm font-semibold transition-colors",
                activa
                  ? "border-indigo-500 bg-indigo-500 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              {n}
            </button>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={page === total}
          onClick={() => goTo(page + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <p
        className="text-xs text-slate-500 dark:text-slate-400"
        aria-live="polite"
      >
        {from}–{to} de {count} {noun}
      </p>
    </nav>
  );
}
