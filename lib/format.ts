const currencyFormatter = new Intl.NumberFormat("es-VE", {
  style: "currency",
  currency: "USD",
});

const bsFormatter = new Intl.NumberFormat("es-VE", {
  style: "currency",
  currency: "VES",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function formatBs(value: number) {
  return bsFormatter.format(value);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function normalizePhone(phone: string | null | undefined) {
  if (!phone) return "";
  return phone.replace(/[^\d+]/g, "");
}