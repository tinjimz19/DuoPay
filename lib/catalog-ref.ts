/**
 * El código de referencia visible de un producto del catálogo.
 *
 * Es un número secuencial por tienda (lo asigna la base al crear el producto) y
 * se muestra con 3 dígitos para que sea fácil de leer y de dictar al pedir por
 * WhatsApp: 4 → "004", 10 → "010", 125 → "125".
 */
export function codigoDeReferencia(ref: number | null | undefined): string {
  if (ref === null || ref === undefined) return "—";
  return String(ref).padStart(3, "0");
}
