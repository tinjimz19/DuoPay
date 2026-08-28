import { formatBs, formatCurrency, normalizePhone } from "@/lib/format";

/**
 * Los mensajes de WhatsApp que la tienda le manda al cliente.
 *
 * `paymentBlock` son las líneas con los datos de cobro, ya armadas en el
 * servidor por `paymentMethodsBlock()`. Llegan hechas texto a propósito:
 * así los componentes de pantalla no tienen que saber nada de métodos de
 * pago, solo pasarlas de largo. De poco sirve recordarle la deuda a
 * alguien si después tiene que escribirte para preguntar dónde pagar.
 */

export interface DebtItem {
  description: string;
  remaining: number;
}

/** Datos de pago + despedida, que van siempre al final del mensaje. */
function cierre(paymentBlock: string[] | undefined, despedida: string): string[] {
  return [...(paymentBlock ?? []), "", despedida];
}

export function buildDebtReminderMessage(params: {
  businessName: string | null | undefined;
  clientName: string;
  items: DebtItem[];
  paymentBlock?: string[];
}): string {
  const business = params.businessName?.trim() || "nuestra tienda";
  const total = params.items.reduce((sum, item) => sum + item.remaining, 0);

  return [
    `Hola ${params.clientName}, te saluda ${business}.`,
    "",
    "Te recuerdo tu saldo pendiente:",
    "",
    ...params.items.map(
      (item) => `- ${item.description}: falta ${formatCurrency(item.remaining)}`
    ),
    "",
    `Total pendiente: ${formatCurrency(total)}`,
    ...cierre(params.paymentBlock, "Cuando puedas haznos el abono. ¡Gracias!"),
  ].join("\n");
}

export function buildTotalDebtReminderMessage(params: {
  businessName: string | null | undefined;
  clientName: string;
  total: number;
  paymentBlock?: string[];
}): string {
  const business = params.businessName?.trim() || "nuestra tienda";

  return [
    `Hola ${params.clientName}, te saluda ${business}.`,
    "",
    `Te recuerdo que tienes un saldo pendiente de ${formatCurrency(params.total)}.`,
    ...cierre(params.paymentBlock, "Cuando puedas haznos el abono. ¡Gracias!"),
  ].join("\n");
}

export interface QuincenaItem {
  description: string;
  amount: number;
}

/**
 * Aviso de quincena: llegó el día de cobro y esto es lo que le toca poner.
 * Distinto del recordatorio de deuda, que habla del saldo total.
 */
export function buildQuincenaReminderMessage(params: {
  businessName: string | null | undefined;
  clientName: string;
  quincenaLabel: string;
  items: QuincenaItem[];
  behind: number;
  paymentBlock?: string[];
}): string {
  const business = params.businessName?.trim() || "nuestra tienda";
  const total = params.items.reduce((sum, item) => sum + item.amount, 0);
  const uno = params.items.length === 1;

  const lines = [
    `Hola ${params.clientName}, te saluda ${business}.`,
    "",
    `Llegó la quincena del ${params.quincenaLabel} y te toca:`,
    "",
    ...params.items.map(
      (item) => `- ${item.description}: ${formatCurrency(item.amount)}`
    ),
  ];

  if (!uno) {
    lines.push("", `Total: ${formatCurrency(total)}`);
  }

  if (params.behind > 0) {
    lines.push(
      "",
      params.behind === 1
        ? "Ahí va incluida la quincena pasada que quedó pendiente."
        : `Ahí van incluidas ${params.behind} quincenas que quedaron pendientes.`
    );
  }

  lines.push(...cierre(params.paymentBlock, "Cuando puedas me avisas. ¡Gracias!"));

  return lines.join("\n");
}

/**
 * Cuánto pedirle por UNA compra: la cuota, no el saldo.
 *
 * Si la quincena trae algo vencido —arrastres incluidos— se pide eso; si
 * no, una cuota. Y nunca más que el saldo, porque cobrar de más no es un
 * favor: es plata que hay que devolver.
 *
 * Está aquí y no en cada pantalla porque la usan tres sitios —el botón de
 * cobrar, el recordatorio de una venta y el de todas las del cliente— y
 * si el mensaje pidiera una cifra y el botón cobrara otra, la tienda
 * quedaría desmintiéndose sola delante del cliente.
 */
export function installmentFor(params: {
  /** Lo vencido de esta quincena, si hay. */
  dueNow?: number | null;
  installmentAmount: number;
  remaining: number;
}): number {
  const remaining = Number(params.remaining);
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;

  const dueNow = Number(params.dueNow ?? 0);
  if (Number.isFinite(dueNow) && dueNow > 0) return Math.min(dueNow, remaining);

  const installment = Number(params.installmentAmount);
  if (Number.isFinite(installment) && installment > 0) {
    return Math.min(installment, remaining);
  }

  // Sin cuota utilizable —una venta vieja mal cargada— se pide el saldo:
  // es preferible a un 0 que obliga a teclear con el cliente esperando.
  return remaining;
}

export interface InstallmentItem {
  description: string;
  /** Lo que se le pide AHORA por esta compra, en dólares. */
  amount: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Recordatorio de CUOTA, con su equivalente en bolívares.
 *
 * Reemplaza al de saldo total en los dos sitios donde se le escribe a un
 * cliente por sus compras. El motivo no es de forma: "debes USD 240" es el
 * mensaje equivocado para cobrar —nadie paga 240 de golpe, y la cifra
 * grande desanima en vez de cobrar—. Lo que se pide hoy es la cuota.
 *
 * Va en bolívares además de en dólares porque es en bolívares que la
 * persona hace el pago móvil. Obligarla a multiplicar es obligarla a
 * equivocarse.
 *
 * Vive aquí, en `lib/`, y no en cada aplicación por su cuenta: el `core/`
 * de la app móvil se sincroniza desde este archivo y hay una prueba que
 * falla si se desvían. Es lo que impide que la misma tienda mande un
 * mensaje desde el navegador y otro distinto desde el teléfono.
 */
export function buildInstallmentReminderMessage(params: {
  businessName: string | null | undefined;
  clientName: string;
  items: InstallmentItem[];
  /** Bolívares por dólar. Sin tasa, el mensaje sale solo en dólares. */
  rate?: number | null;
  paymentBlock?: string[];
}): string {
  const business = params.businessName?.trim() || "nuestra tienda";
  const useful = params.items.filter(
    (item) => Number.isFinite(item.amount) && item.amount > 0
  );

  const rate = params.rate;
  const hasRate = rate != null && Number.isFinite(rate) && rate > 0;
  const inBs = (amount: number) => round2(amount * (rate as number));

  const lines = useful.map((item) =>
    hasRate
      ? `- ${item.description}: ${formatCurrency(item.amount)} · ${formatBs(inBs(item.amount))}`
      : `- ${item.description}: ${formatCurrency(item.amount)}`
  );

  const totalUsd = round2(useful.reduce((sum, item) => sum + item.amount, 0));

  /*
    El total en bolívares es la SUMA DE LAS LÍNEAS, no el total en dólares
    multiplicado por la tasa. Los dos caminos dan cifras distintas por el
    redondeo, y quien recibe el mensaje suma las líneas a mano: ese
    céntimo de diferencia es una discusión en la puerta de una casa.
  */
  const totalBs = hasRate
    ? round2(useful.reduce((sum, item) => sum + inBs(item.amount), 0))
    : 0;

  const one = useful.length === 1;

  const out = [
    `Hola ${params.clientName}, te saluda ${business}.`,
    "",
    one ? "Te recuerdo tu cuota:" : "Te recuerdo tus cuotas:",
    "",
    ...lines,
  ];

  // Con una sola compra, el total repetiría la única línea.
  if (!one) {
    out.push(
      "",
      hasRate
        ? `Total: ${formatCurrency(totalUsd)} · ${formatBs(totalBs)}`
        : `Total: ${formatCurrency(totalUsd)}`
    );
  }

  // De dónde salió el número en bolívares. Sin esto, el cliente que
  // calcula con otra tasa cree que se le está cobrando de más.
  if (hasRate) {
    out.push("", `Calculado a la tasa BCV de hoy: ${formatBs(rate as number)}`);
  }

  out.push(...cierre(params.paymentBlock, "Cuando puedas haznos el abono. ¡Gracias!"));

  return out.join("\n");
}

export function whatsappReminderUrl(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}
