/**
 * Pruebas de los métodos de cobro.
 *
 *   npx tsx lib/payment-methods.test.ts
 *
 * Puro cálculo, no tocan la base de datos. Si algo se rompe, lanza.
 */
import {
  PAYMENT_KINDS,
  paymentMethodError,
  paymentMethodLines,
  paymentMethodTitle,
  paymentMethodsBlock,
  type PaymentMethod,
} from "@/lib/payment-methods";
import { buildTotalDebtReminderMessage } from "@/lib/reminders";

let checks = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}\n  esperado: ${b}\n  recibido: ${a}`);
}

function metodo(p: Partial<PaymentMethod>): PaymentMethod {
  return {
    id: "x", kind: "PAGO_MOVIL", label: null, bank: null, account: null,
    holder: null, document: null, is_active: true, sort_order: 0, ...p,
  };
}

const pagoMovil = metodo({
  kind: "PAGO_MOVIL", bank: "Banesco",
  account: "0412 333 4455", document: "V-12345678",
});
const zelle = metodo({
  id: "z", kind: "ZELLE",
  account: "marisol@correo.com", holder: "Marisol Guevara",
});
const efectivo = metodo({ id: "e", kind: "EFECTIVO" });

// ---------------------------------------------------------------
// Título
// ---------------------------------------------------------------

eq(paymentMethodTitle(pagoMovil), "Pago Móvil · Banesco", "el banco entra en el título");
eq(paymentMethodTitle(zelle), "Zelle", "sin banco, solo el tipo");
eq(paymentMethodTitle(efectivo), "Efectivo", "efectivo");
eq(
  paymentMethodTitle(metodo({ ...pagoMovil, label: "El de mi esposa" })),
  "El de mi esposa",
  "el apodo manda sobre todo"
);

// ---------------------------------------------------------------
// Líneas de datos
// ---------------------------------------------------------------

eq(
  paymentMethodLines(pagoMovil),
  ["Teléfono: 0412 333 4455", "Cédula o RIF: V-12345678"],
  "no repite el banco, que ya va en el título"
);
eq(
  paymentMethodLines(metodo({ ...pagoMovil, label: "El de mi esposa" })),
  ["Banco: Banesco", "Teléfono: 0412 333 4455", "Cédula o RIF: V-12345678"],
  "con apodo sí hace falta decir el banco"
);
eq(
  paymentMethodLines(zelle),
  ["Correo o teléfono: marisol@correo.com", "Titular: Marisol Guevara"],
  "zelle"
);
eq(paymentMethodLines(efectivo), [], "efectivo no lleva datos");
eq(
  paymentMethodLines(metodo({ kind: "ZELLE", account: "solo@correo.com" })),
  ["Correo o teléfono: solo@correo.com"],
  "los campos vacíos no dejan líneas huérfanas"
);

// ---------------------------------------------------------------
// Qué falta para poder guardar
// ---------------------------------------------------------------

eq(paymentMethodError(pagoMovil), null, "pago móvil completo");
eq(paymentMethodError(efectivo), null, "efectivo no pide nada");
eq(
  paymentMethodError({ kind: "PAGO_MOVIL", bank: "Banesco", account: "" }),
  "Falta teléfono",
  "avisa por el campo que falta"
);
eq(
  paymentMethodError({ kind: "PAGO_MOVIL", bank: "Banesco", account: "0412", document: "  " }),
  "Falta cédula o rif",
  "un campo con solo espacios cuenta como vacío"
);
eq(
  paymentMethodError({ kind: "ZELLE", account: "a@b.com" }),
  "Falta titular",
  "zelle exige titular"
);
eq(
  paymentMethodError({ kind: "BINANCE", account: "a@b.com" }),
  null,
  "en binance el titular es opcional"
);

// Todo tipo declarado tiene ficha; si no, el formulario reventaría al
// seleccionarlo.
for (const kind of Object.keys(PAYMENT_KINDS)) {
  checks++;
  const spec = PAYMENT_KINDS[kind as keyof typeof PAYMENT_KINDS];
  if (!spec || typeof spec.label !== "string" || !Array.isArray(spec.fields)) {
    throw new Error(`el tipo ${kind} no tiene ficha completa`);
  }
}

// ---------------------------------------------------------------
// El bloque que se pega al WhatsApp
// ---------------------------------------------------------------

eq(paymentMethodsBlock([]), [], "sin métodos no hay bloque");
eq(
  paymentMethodsBlock([metodo({ ...zelle, is_active: false })]),
  [],
  "los apagados no se mandan"
);
eq(
  paymentMethodsBlock([pagoMovil, zelle]).join("\n"),
  [
    "",
    "Puedes pagarme por:",
    "• Pago Móvil · Banesco",
    "  Teléfono: 0412 333 4455",
    "  Cédula o RIF: V-12345678",
    "• Zelle",
    "  Correo o teléfono: marisol@correo.com",
    "  Titular: Marisol Guevara",
  ].join("\n"),
  "bloque completo"
);

// ---------------------------------------------------------------
// Cómo queda el mensaje entero
// ---------------------------------------------------------------

const conDatos = buildTotalDebtReminderMessage({
  businessName: "Boutique Marisol",
  clientName: "Yorgelis",
  total: 139.5,
  paymentBlock: paymentMethodsBlock([pagoMovil]),
});

checks++;
if (!conDatos.includes("Puedes pagarme por:")) {
  throw new Error("el recordatorio no trae los datos de pago");
}
checks++;
if (!conDatos.trimEnd().endsWith("¡Gracias!")) {
  throw new Error("la despedida tiene que quedar de última:\n" + conDatos);
}
checks++;
if (conDatos.indexOf("139,50") > conDatos.indexOf("Puedes pagarme")) {
  throw new Error("el monto tiene que ir antes de los datos de pago");
}

// Una tienda sin datos de pago sigue mandando el mensaje de siempre.
const sinDatos = buildTotalDebtReminderMessage({
  businessName: "Boutique Marisol",
  clientName: "Yorgelis",
  total: 139.5,
});
checks++;
if (sinDatos.includes("Puedes pagarme")) {
  throw new Error("sin métodos no debería aparecer el bloque");
}
eq(
  sinDatos.split("\n").filter((l) => l === "").length,
  2,
  "sin datos de pago no quedan renglones en blanco de más"
);

console.log(`payment-methods.ts — ${checks} comprobaciones, todas en verde.`);
