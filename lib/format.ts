export const CARACAS_TIMEZONE = "America/Caracas";

/** Única lista de meses abreviados, para que nada diga "sept" y otro "sep". */
export const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
] as const;

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

/** "3:37pm" — hora compacta, para que quepa junto a otra cosa en una línea. */
export function formatTimeShort(date: string | Date) {
  const parts = new Intl.DateTimeFormat("es-VE", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: CARACAS_TIMEZONE,
  }).formatToParts(new Date(date));

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  // es-VE devuelve "p. m."; lo dejamos en "pm".
  const period = get("dayPeriod").replace(/[.\s\u202f\u00a0]/g, "").toLowerCase();
  return `${get("hour")}:${get("minute")}${period}`;
}

/** "21 sep" — para insignias y espacios estrechos. */
export function formatDateShort(date: string | Date) {
  const [, month, day] = caracasDateStr(new Date(date)).split("-").map(Number);
  return `${day} ${MESES_CORTOS[month - 1]}`;
}

export function normalizePhone(phone: string | null | undefined) {
  if (!phone) return "";
  return phone.replace(/[^\d+]/g, "");
}