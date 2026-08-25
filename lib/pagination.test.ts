/**
 * Pruebas del troceo de listas.
 *
 *   npx tsx lib/pagination.test.ts
 *
 * Puro cálculo, no tocan la base de datos. Si algo se rompe, lanza.
 */
import {
  PAGE_SIZE,
  clampPage,
  pageRange,
  pageSlice,
  totalPages,
  visiblePages,
} from "@/lib/pagination";

let checks = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${label}\n  esperado: ${b}\n  recibido: ${a}`);
  }
}

const lista = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

// ---------------------------------------------------------------
// totalPages
// ---------------------------------------------------------------

eq(PAGE_SIZE, 8, "el tamaño de página pedido");
eq(totalPages(0), 1, "lista vacía sigue siendo página 1 de 1");
eq(totalPages(1), 1, "un solo elemento");
eq(totalPages(8), 1, "justo una página llena");
eq(totalPages(9), 2, "uno más ya son dos páginas");
eq(totalPages(43), 6, "43 elementos");

// ---------------------------------------------------------------
// clampPage — el filtro puede dejarte fuera de rango
// ---------------------------------------------------------------

eq(clampPage(1, 43), 1, "primera página");
eq(clampPage(6, 43), 6, "última página");
eq(clampPage(9, 43), 6, "más allá del final vuelve a la última");
eq(clampPage(0, 43), 1, "página cero no existe");
eq(clampPage(-3, 43), 1, "negativa tampoco");
eq(clampPage(4, 0), 1, "si el filtro no dejó nada, página 1");
// El caso real: estabas en la 4 y buscas algo que deja 3 resultados.
eq(clampPage(4, 3), 1, "filtrar te devuelve a una página que sí existe");

// ---------------------------------------------------------------
// pageSlice
// ---------------------------------------------------------------

eq(pageSlice(lista(20), 1), [1, 2, 3, 4, 5, 6, 7, 8], "primera página, 8 items");
eq(pageSlice(lista(20), 2), [9, 10, 11, 12, 13, 14, 15, 16], "segunda página");
eq(pageSlice(lista(20), 3), [17, 18, 19, 20], "la última va incompleta");
eq(pageSlice(lista(20), 99), [17, 18, 19, 20], "pasarse muestra la última");
eq(pageSlice([], 1), [], "lista vacía");
eq(pageSlice(lista(8), 1).length, 8, "exactamente 8 caben en una página");

// Ningún elemento se pierde ni se repite al recorrer todas las páginas.
{
  const items = lista(43);
  const recorrido: number[] = [];
  for (let p = 1; p <= totalPages(43); p++) recorrido.push(...pageSlice(items, p));
  eq(recorrido, items, "recorrer todas las páginas devuelve la lista entera");
}

// ---------------------------------------------------------------
// pageRange — el resumen "9-16 de 43"
// ---------------------------------------------------------------

eq(pageRange(1, 43), { from: 1, to: 8 }, "resumen de la primera");
eq(pageRange(2, 43), { from: 9, to: 16 }, "resumen de la segunda");
eq(pageRange(6, 43), { from: 41, to: 43 }, "la última no inventa elementos");
eq(pageRange(1, 0), { from: 0, to: 0 }, "sin resultados no hay rango");
eq(pageRange(1, 5), { from: 1, to: 5 }, "menos de una página");

// ---------------------------------------------------------------
// visiblePages — la ventana de números
// ---------------------------------------------------------------

eq(visiblePages(1, 20), [1, 2, 3], "con pocas páginas salen todas");
eq(visiblePages(1, 100), [1, 2, 3, 4, 5], "al principio, las cinco primeras");
eq(visiblePages(3, 100), [1, 2, 3, 4, 5], "todavía sin desplazar");
eq(visiblePages(4, 100), [2, 3, 4, 5, 6], "la ventana empieza a correrse");
eq(visiblePages(13, 100), [9, 10, 11, 12, 13], "al final se pega al tope");

// La actual siempre tiene que estar entre los números dibujados, o el
// resaltado apuntaría a una página que no se ve.
for (let count = 1; count <= 60; count++) {
  for (let p = 1; p <= totalPages(count); p++) {
    const numeros = visiblePages(p, count);
    checks++;
    if (!numeros.includes(p)) {
      throw new Error(`la página ${p} de ${count} elementos no sale en ${numeros}`);
    }
    if (numeros.length > 5) {
      throw new Error(`demasiados números para ${count} elementos: ${numeros}`);
    }
  }
}

console.log(`pagination.ts — ${checks} comprobaciones, todas en verde.`);
