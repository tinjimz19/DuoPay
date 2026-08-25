/**
 * Pruebas de los montos escritos a mano.
 *
 *   npx tsx lib/money.test.ts
 *
 * Puro cálculo, no tocan la base de datos. Si algo se rompe, lanza.
 */
import {
  isValidMoney,
  moneyInputValue,
  parseMoney,
  sanitizeMoneyInput,
} from "@/lib/money";

let checks = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  checks++;
  if (actual !== expected) {
    throw new Error(
      `${label}\n  esperado: ${JSON.stringify(expected)}\n  recibido: ${JSON.stringify(actual)}`
    );
  }
}

function nan(actual: number, label: string) {
  checks++;
  if (!Number.isNaN(actual)) {
    throw new Error(`${label}\n  esperado NaN, recibido: ${actual}`);
  }
}

// ---------------------------------------------------------------
// sanitizeMoneyInput — qué se puede teclear
// ---------------------------------------------------------------

// El caso que reportó el usuario: la coma tiene que entrar.
eq(sanitizeMoneyInput("100,5"), "100,5", "coma simple");
eq(sanitizeMoneyInput("100,50"), "100,50", "coma con dos decimales");
eq(sanitizeMoneyInput("100.50"), "100.50", "el punto también sirve");

// Se respeta el separador que la persona escribió, no se le cambia debajo.
eq(sanitizeMoneyInput("7,25"), "7,25", "no convierte la coma en punto");

// Un solo separador: el segundo se descarta.
eq(sanitizeMoneyInput("100,50,25"), "100,50", "dos comas");
eq(sanitizeMoneyInput("1.2,3"), "1.23", "punto y luego coma");

// Máximo dos decimales: así "1.500" no puede existir y nunca hay que
// adivinar si eran mil quinientos o uno con cinco.
eq(sanitizeMoneyInput("1,999"), "1,99", "tercer decimal descartado");
eq(sanitizeMoneyInput("1.500"), "1.50", "el caso ambiguo no se puede teclear");

// Basura fuera.
eq(sanitizeMoneyInput("abc"), "", "solo letras");
eq(sanitizeMoneyInput("$ 12,30"), "12,30", "símbolo de moneda");
eq(sanitizeMoneyInput("-45"), "45", "el signo no aplica a un abono");
eq(sanitizeMoneyInput("12 30"), "1230", "espacios");
eq(sanitizeMoneyInput(""), "", "vacío");

// Estados intermedios mientras se teclea: no se puede romper el campo.
eq(sanitizeMoneyInput(","), ",", "solo la coma, a mitad de escribir");
eq(sanitizeMoneyInput("12,"), "12,", "coma al final, sin decimales todavía");

// Tope de enteros.
eq(sanitizeMoneyInput("123456789"), "12345678", "corta a 8 enteros");
eq(sanitizeMoneyInput("123456789,99"), "12345678,99", "corta enteros, deja decimales");

// ---------------------------------------------------------------
// parseMoney — texto a número
// ---------------------------------------------------------------

eq(parseMoney("100,50"), 100.5, "coma a número");
eq(parseMoney("100.50"), 100.5, "punto a número");
eq(parseMoney("100"), 100, "entero");
eq(parseMoney(",50"), 0.5, "sin parte entera");
eq(parseMoney("12,"), 12, "coma colgando al final");
eq(parseMoney(" 8,25 "), 8.25, "con espacios alrededor");
eq(parseMoney(42.75), 42.75, "ya venía como número");

nan(parseMoney(""), "vacío no es un monto");
nan(parseMoney(null), "null no es un monto");
nan(parseMoney(undefined), "undefined no es un monto");
nan(parseMoney("abc"), "texto no es un monto");

// ---------------------------------------------------------------
// moneyInputValue — número al campo
// ---------------------------------------------------------------

eq(moneyInputValue(100.5), "100,50", "rellena con la coma local");
eq(moneyInputValue(12), "12,00", "entero con dos decimales");
eq(moneyInputValue(0), "0,00", "cero");
eq(moneyInputValue(null), "", "null queda vacío");
eq(moneyInputValue(undefined), "", "undefined queda vacío");
eq(moneyInputValue(NaN), "", "NaN queda vacío");

// ---------------------------------------------------------------
// El viaje completo: lo que se ve es lo que se guarda
// ---------------------------------------------------------------

for (const monto of [0.01, 0.5, 7.25, 33.33, 100.5, 1234.56, 99999.99]) {
  const texto = moneyInputValue(monto);
  eq(sanitizeMoneyInput(texto), texto, `"${texto}" sobrevive al saneado`);
  eq(parseMoney(texto), monto, `"${texto}" vuelve a ser ${monto}`);
}

// Y tecleado a mano, en cualquiera de los dos formatos, da lo mismo.
eq(parseMoney(sanitizeMoneyInput("33,33")), 33.33, "tecleado con coma");
eq(parseMoney(sanitizeMoneyInput("33.33")), 33.33, "tecleado con punto");

// ---------------------------------------------------------------
// isValidMoney — el guardia de los botones
// ---------------------------------------------------------------

eq(isValidMoney("0,01"), true, "el mínimo sirve");
eq(isValidMoney("0"), false, "cero no es un abono");
eq(isValidMoney("0,00"), false, "cero con decimales tampoco");
eq(isValidMoney(""), false, "vacío no");
eq(isValidMoney(","), false, "solo el separador no");
eq(isValidMoney("abc"), false, "texto no");

console.log(`money.ts — ${checks} comprobaciones, todas en verde.`);
