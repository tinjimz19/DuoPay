import { formatCurrency, normalizePhone } from "@/lib/format";

export interface DebtItem {
  description: string;
  remaining: number;
}

export function buildDebtReminderMessage(params: {
  businessName: string | null | undefined;
  clientName: string;
  items: DebtItem[];
}): string {
  const business = params.businessName?.trim() || "nuestra tienda";
  const total = params.items.reduce((sum, item) => sum + item.remaining, 0);

  const lines = [
    `Hola ${params.clientName}, te saluda ${business}.`,
    "",
    "Te recuerdo tu saldo pendiente:",
    "",
    ...params.items.map(
      (item) => `- ${item.description}: falta ${formatCurrency(item.remaining)}`
    ),
    "",
    `Total pendiente: ${formatCurrency(total)}`,
    "",
    "Cuando puedas haznos el abono. ¡Gracias!",
  ];

  return lines.join("\n");
}

export function buildTotalDebtReminderMessage(params: {
  businessName: string | null | undefined;
  clientName: string;
  total: number;
}): string {
  const business = params.businessName?.trim() || "nuestra tienda";

  return [
    `Hola ${params.clientName}, te saluda ${business}.`,
    "",
    `Te recuerdo que tienes un saldo pendiente de ${formatCurrency(params.total)}.`,
    "",
    "Cuando puedas haznos el abono. ¡Gracias!",
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

  lines.push("", "Cuando puedas me avisas. ¡Gracias!");

  return lines.join("\n");
}

export function whatsappReminderUrl(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}
