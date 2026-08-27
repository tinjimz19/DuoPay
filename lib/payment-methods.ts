/**
 * Métodos de cobro de la tienda.
 *
 * Todos comparten las mismas cuatro columnas (banco, cuenta, titular,
 * documento) porque en el fondo son lo mismo con otro nombre: el
 * "teléfono" de un Pago Móvil y el "correo" de un Zelle ocupan el mismo
 * lugar. Lo que cambia es qué campos se piden y cómo se llaman en
 * pantalla, y eso vive aquí.
 */

export type PaymentMethodKind =
  | "PAGO_MOVIL"
  | "TRANSFERENCIA"
  | "ZELLE"
  | "BINANCE"
  | "EFECTIVO"
  | "OTRO";

export type PaymentFieldKey = "bank" | "account" | "holder" | "document";

export interface PaymentField {
  key: PaymentFieldKey;
  label: string;
  placeholder: string;
  required: boolean;
  inputMode?: "tel" | "email" | "numeric" | "text";
}

export interface PaymentKindSpec {
  label: string;
  /** Una línea que explica para qué sirve, en el selector. */
  hint: string;
  fields: PaymentField[];
}

export const PAYMENT_KINDS: Record<PaymentMethodKind, PaymentKindSpec> = {
  PAGO_MOVIL: {
    label: "Pago Móvil",
    hint: "Banco, teléfono y cédula",
    fields: [
      { key: "bank", label: "Banco", placeholder: "Banesco", required: true },
      { key: "account", label: "Teléfono", placeholder: "0412 333 4455", required: true, inputMode: "tel" },
      { key: "document", label: "Cédula o RIF", placeholder: "V-12345678", required: true },
      { key: "holder", label: "Titular", placeholder: "A nombre de quién", required: false },
    ],
  },
  TRANSFERENCIA: {
    label: "Transferencia",
    hint: "Cuenta bancaria completa",
    fields: [
      { key: "bank", label: "Banco", placeholder: "Banco de Venezuela", required: true },
      { key: "account", label: "Número de cuenta", placeholder: "0102 0000 00 0000000000", required: true, inputMode: "numeric" },
      { key: "holder", label: "Titular", placeholder: "A nombre de quién", required: true },
      { key: "document", label: "Cédula o RIF", placeholder: "V-12345678", required: true },
    ],
  },
  ZELLE: {
    label: "Zelle",
    hint: "Correo o teléfono en dólares",
    fields: [
      { key: "account", label: "Correo o teléfono", placeholder: "tucorreo@gmail.com", required: true, inputMode: "email" },
      { key: "holder", label: "Titular", placeholder: "Nombre en la cuenta", required: true },
    ],
  },
  BINANCE: {
    label: "Binance",
    hint: "Correo o Pay ID",
    fields: [
      { key: "account", label: "Correo o Pay ID", placeholder: "tucorreo@gmail.com", required: true },
      { key: "holder", label: "Titular", placeholder: "Nombre en la cuenta", required: false },
    ],
  },
  EFECTIVO: {
    label: "Efectivo",
    hint: "En la tienda, sin datos que poner",
    fields: [],
  },
  OTRO: {
    label: "Otro",
    hint: "Cualquier otra forma de cobro",
    fields: [
      { key: "account", label: "Datos", placeholder: "Cómo te pagan", required: true },
      { key: "holder", label: "Titular", placeholder: "A nombre de quién", required: false },
    ],
  },
};

export const PAYMENT_KIND_OPTIONS = (
  Object.keys(PAYMENT_KINDS) as PaymentMethodKind[]
).map((value) => ({ value, ...PAYMENT_KINDS[value] }));

export interface PaymentMethod {
  id: string;
  kind: PaymentMethodKind;
  label: string | null;
  bank: string | null;
  account: string | null;
  holder: string | null;
  document: string | null;
  is_active: boolean;
  sort_order: number;
}

/** Cómo se llama este método en pantalla. */
export function paymentMethodTitle(m: PaymentMethod): string {
  const base = PAYMENT_KINDS[m.kind]?.label ?? "Método";
  const apodo = m.label?.trim();
  if (apodo) return apodo;
  return m.bank?.trim() ? `${base} · ${m.bank.trim()}` : base;
}

/** Las líneas de datos, ya rotuladas, para pintarlas o mandarlas. */
export function paymentMethodLines(m: PaymentMethod): string[] {
  const spec = PAYMENT_KINDS[m.kind];
  if (!spec) return [];
  // Sin apodo, el banco ya viaja en el título; repetirlo sería ruido.
  const bancoEnTitulo = !m.label?.trim() && !!m.bank?.trim();
  return spec.fields
    .filter((f) => !(f.key === "bank" && bancoEnTitulo))
    .map((f) => {
      const valor = m[f.key]?.trim();
      return valor ? `${f.label}: ${valor}` : null;
    })
    .filter((line): line is string => line !== null);
}

/** Qué le falta a un método para poder guardarse (null = está listo). */
export function paymentMethodError(input: {
  kind: PaymentMethodKind;
  bank?: string | null;
  account?: string | null;
  holder?: string | null;
  document?: string | null;
}): string | null {
  const spec = PAYMENT_KINDS[input.kind];
  if (!spec) return "Elige un método de pago";
  for (const field of spec.fields) {
    if (!field.required) continue;
    if (!input[field.key]?.trim()) return `Falta ${field.label.toLowerCase()}`;
  }
  return null;
}

/**
 * El bloque que se le pega al recordatorio de WhatsApp.
 *
 * Es la razón de ser de todo esto: de nada sirve recordarle la deuda a
 * alguien si después tiene que escribirte para preguntar dónde pagar.
 */
export function paymentMethodsBlock(methods: PaymentMethod[]): string[] {
  const activos = methods.filter((m) => m.is_active);
  if (activos.length === 0) return [];

  const lines: string[] = ["", "Puedes pagarme por:"];
  for (const m of activos) {
    lines.push(`• ${paymentMethodTitle(m)}`);
    for (const line of paymentMethodLines(m)) {
      lines.push(`  ${line}`);
    }
  }
  return lines;
}
