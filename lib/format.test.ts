/**
 * Pruebas del teléfono normalizado.
 *
 *   npx tsx lib/format.test.ts
 *
 * Existen por un fallo concreto: los clientes guardados como
 * `04125556666` —el formato normal en Venezuela— generaban un enlace de
 * WhatsApp que WhatsApp rechazaba, mientras que los guardados como
 * `+584125556666` funcionaban. Cada caso de aquí abajo es una forma real
 * en la que alguien escribe un teléfono.
 */
import { normalizePhone, phoneCallHref } from "@/lib/format";

let checks = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  checks++;
  if (actual !== expected) {
    throw new Error(
      `${label}\n  esperado: ${JSON.stringify(expected)}\n  recibido: ${JSON.stringify(actual)}`
    );
  }
}

const ESPERADO = "584125556666";

// --- el bug: el formato venezolano de toda la vida -------------------
eq(normalizePhone("04125556666"), ESPERADO, "0412 pegado");
eq(normalizePhone("0412-555-6666"), ESPERADO, "con guiones");
eq(normalizePhone("0412 555 6666"), ESPERADO, "con espacios");
eq(normalizePhone("(0412) 555-6666"), ESPERADO, "con paréntesis");
eq(normalizePhone(" 0412 555 66 66 "), ESPERADO, "con espacios de sobra");

// --- las cuatro operadoras, que no se quede ninguna fuera ------------
eq(normalizePhone("04145556666"), "584145556666", "Movistar 0414");
eq(normalizePhone("04165556666"), "584165556666", "Movilnet 0416");
eq(normalizePhone("04245556666"), "584245556666", "Movistar 0424");
eq(normalizePhone("04265556666"), "584265556666", "Movilnet 0426");

// --- un fijo también es un número válido -----------------------------
eq(normalizePhone("02125556666"), "582125556666", "fijo de Caracas");
eq(normalizePhone("02615556666"), "582615556666", "fijo de Maracaibo");

// --- lo que ya venía bien no se rompe --------------------------------
eq(normalizePhone("+584125556666"), ESPERADO, "con más y código");
eq(normalizePhone("584125556666"), ESPERADO, "código sin más");
eq(normalizePhone("+58 412 555 6666"), ESPERADO, "con más y espacios");
eq(normalizePhone("+58-412-555-6666"), ESPERADO, "con más y guiones");

// --- las dos cosas a la vez, que pasa más de lo que parece -----------
eq(normalizePhone("+5804125556666"), ESPERADO, "código y 0, los dos");
eq(normalizePhone("5804125556666"), ESPERADO, "código y 0, sin el más");
eq(normalizePhone("00584125556666"), ESPERADO, "el 00 de marcar afuera");
eq(normalizePhone("0058 0412 555 6666"), ESPERADO, "el 00 y el 0 también");

// --- sin el 0 de adelante --------------------------------------------
eq(normalizePhone("4125556666"), ESPERADO, "celular pelado");
eq(normalizePhone("412 555 6666"), ESPERADO, "celular pelado con espacios");

// --- un país que no es Venezuela: se respeta -------------------------
eq(normalizePhone("+13055551234"), "13055551234", "un móvil de Estados Unidos");
eq(normalizePhone("+34 600 55 66 77"), "34600556677", "un móvil de España");
eq(normalizePhone("+57 300 555 6666"), "573005556666", "un móvil de Colombia");
eq(normalizePhone("+5491155556666"), "5491155556666", "un móvil de Argentina");
// Este es el que obliga a mirar el `+`: sin él parecería un 0412 nuestro.
eq(normalizePhone("+51 999 555 666"), "51999555666", "Perú, que también empieza en 5");

// --- lo que no se entiende se devuelve como estaba -------------------
eq(normalizePhone(""), "", "vacío");
eq(normalizePhone(null), "", "null");
eq(normalizePhone(undefined), "", "undefined");
eq(normalizePhone("   "), "", "solo espacios");
eq(normalizePhone("no tengo"), "", "puro texto");
eq(normalizePhone("555"), "555", "muy corto: se devuelve igual");
eq(normalizePhone("04125556"), "04125556", "incompleto: no se inventa nada");
eq(normalizePhone("041255566667777"), "041255566667777", "de más: tampoco se toca");

// --- el 0 no se le quita a cualquier cosa ----------------------------
// Once dígitos empezando por 0 pero con un área imposible: no es un
// número venezolano, así que se deja como está en vez de fabricar uno.
eq(normalizePhone("09125556666"), "09125556666", "área que no existe");
eq(normalizePhone("01125556666"), "01125556666", "área que no existe tampoco");

// --- la misma persona guardada de dos formas es una sola -------------
eq(
  normalizePhone("0414-555-6622"),
  normalizePhone("+58 414 555 6622"),
  "el alta de clientes tiene que ver un solo cliente aquí"
);

// --- el botón de llamar quiere el más, y wa.me no lo quiere ----------
// Un `tel:` sin el más se marca como número local: doce dígitos que no
// son de nadie, y la llamada no entra.
eq(phoneCallHref("04125556666"), "tel:+584125556666", "llamar a un 0412");
eq(phoneCallHref("+584125556666"), "tel:+584125556666", "llamar a uno ya internacional");
eq(phoneCallHref("0212-555-6666"), "tel:+582125556666", "llamar a un fijo");
eq(phoneCallHref("+13055551234"), "tel:+13055551234", "llamar al exterior");
eq(phoneCallHref("555"), "tel:555", "lo que no se reconoce se marca igual");
eq(phoneCallHref(""), "", "sin teléfono no hay enlace");
eq(phoneCallHref(null), "", "null tampoco");
eq(phoneCallHref("no tengo"), "", "puro texto tampoco");

console.log(`format.ts — ${checks} comprobaciones, todas en verde.`);
