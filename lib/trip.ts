import { MESES_CORTOS } from "@/lib/format";

/** Un viaje es solo una fecha. */
export interface Trip {
  id: string;
  /** "YYYY-MM-DD" */
  travel_date: string;
}

/** El valor que representa la bandeja "Sin viaje" en los selectores. */
export const SIN_VIAJE = "__sin__";

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/*
  OJO con la zona horaria: una fecha "2026-10-07" pasada por `new Date()` se
  interpreta como medianoche UTC, que en Venezuela es el día ANTERIOR por la
  tarde. Por eso aquí se parten los números del texto a mano, sin `Date`: así
  "7 de octubre" es siempre el 7, no el 6.
*/

/** "7 oct" a partir de "YYYY-MM-DD". */
export function etiquetaViajeCorta(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split("-").map(Number);
  return `${day} ${MESES_CORTOS[month - 1]}`;
}

/** "7 de octubre" a partir de "YYYY-MM-DD". */
export function etiquetaViajeLarga(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split("-").map(Number);
  return `${day} de ${MESES_LARGOS[month - 1]}`;
}
