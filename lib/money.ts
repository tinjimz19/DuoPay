/**
 * Montos escritos a mano.
 *
 * Aquí la coma es el separador decimal — la app misma muestra "USD 1.234,50".
 * Pero los campos eran `<input type="number">`, y ese control DESCARTA todo lo
 * que el navegador considere inválido: con un teclado en español la coma entra
 * en esa categoría, así que `e.target.value` llegaba vacío. La coma no es que
 * se viera mal, es que nunca existió para React. Por eso los `.replace(",", ".")`
 * que ya estaban repartidos por el código jamás llegaron a ver una coma.
 *
 * La salida es escribir el campo como texto y controlar nosotros qué entra.
 */

const SEPARADOR = /[.,]/;

/** Tope de dígitos enteros: 8 alcanza para 99.999.999. */
const MAX_ENTEROS = 8;

/**
 * Deja pasar solo lo que puede formar un monto: dígitos, UN separador decimal
 * y como mucho dos decimales. Respeta el separador que la persona escribió.
 *
 * A propósito NO se admite separador de miles. "1.500" sería ambiguo —¿mil
 * quinientos, o uno con cinco?— y en un campo de plata esa ambigüedad se paga
 * caro. Al limitar a dos decimales el caso ni siquiera se puede teclear, así
 * que el valor que se ve es siempre el valor que se guarda.
 */
export function sanitizeMoneyInput(raw: string): string {
  const limpio = raw.replace(/[^\d.,]/g, "");
  if (limpio === "") return "";

  const corte = limpio.search(SEPARADOR);
  if (corte === -1) return limpio.slice(0, MAX_ENTEROS);

  const enteros = limpio.slice(0, corte).slice(0, MAX_ENTEROS);
  const separador = limpio[corte] === "." ? "." : ",";
  const decimales = limpio
    .slice(corte + 1)
    .replace(/\D/g, "")
    .slice(0, 2);

  return `${enteros}${separador}${decimales}`;
}

/**
 * Texto tecleado -> número. Acepta coma o punto indistintamente.
 * Devuelve NaN si no hay nada aprovechable, para que quien llame decida.
 *
 * Un solo `replace` basta porque lo que llega ya pasó por `sanitizeMoneyInput`
 * o por `moneyInputValue`, y ninguno de los dos produce dos separadores.
 */
export function parseMoney(raw: string | number | null | undefined): number {
  if (typeof raw === "number") return raw;
  if (raw === null || raw === undefined) return NaN;

  const texto = String(raw).trim();
  if (texto === "") return NaN;

  return parseFloat(texto.replace(",", "."));
}

/** Número -> texto para el campo, con la coma que se usa aquí. */
export function moneyInputValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }
  return value.toFixed(2).replace(".", ",");
}

/** ¿Lo tecleado sirve como monto a cobrar? */
export function isValidMoney(raw: string): boolean {
  const value = parseMoney(raw);
  return Number.isFinite(value) && value > 0;
}
