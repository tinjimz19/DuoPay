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

export function whatsappReminderUrl(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}
