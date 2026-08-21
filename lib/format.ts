export const CARACAS_TIMEZONE = "America/Caracas";

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
    timeZone: CARACAS_TIMEZONE,
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CARACAS_TIMEZONE,
  }).format(new Date(date));
}

/** Fecha de hoy (o de cualquier instante) según el calendario de Venezuela. */
export function caracasDateStr(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CARACAS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function normalizePhone(phone: string | null | undefined) {
  if (!phone) return "";
  return phone.replace(/[^\d+]/g, "");
}