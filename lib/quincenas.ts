import { caracasDateStr, MESES_CORTOS } from "@/lib/format";

/**
 * En Venezuela la gente cobra sueldo el 15 y el 1ero, así que la cobranza no
 * son 40 vencimientos sueltos: son dos jornadas al mes en las que le toca a
 * todo el mundo a la vez.
 *
 * Modelamos eso como "quincenas": un ciclo de cobranza identificado por un
 * índice entero para poder sumarlos y restarlos.
 *
 *   índice = año*24 + (mes-1)*2 + mitad
 *   mitad 0 -> se cobra el 15 de ese mes
 *   mitad 1 -> se cobra el 1ero del mes siguiente
 *
 * De la venta solo se guarda en qué quincena empieza a cobrarse
 * (`first_charge_date`). Todo lo demás se deriva.
 */

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export interface CivilDate {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
}

/** Hoy según el calendario de Venezuela, no el del servidor. */
export function caracasToday(now: Date = new Date()): CivilDate {
  const [year, month, day] = caracasDateStr(now).split("-").map(Number);
  return { year, month, day };
}

export function quincenaIndex(year: number, month: number, half: 0 | 1): number {
  return year * 24 + (month - 1) * 2 + half;
}

/**
 * El ciclo de cobranza vigente: aquel cuya fecha de cobro ya llegó.
 * Del 15 en adelante se cobra la primera mitad del mes; del 1 al 14 se sigue
 * cobrando lo del 1ero, que es la segunda mitad del mes anterior.
 */
export function currentQuincena(now: Date = new Date()): number {
  const { year, month, day } = caracasToday(now);
  const firstHalf = quincenaIndex(year, month, 0);
  return day >= 15 ? firstHalf : firstHalf - 1;
}

export function nextQuincena(now: Date = new Date()): number {
  return currentQuincena(now) + 1;
}

/** Fecha en que se cobra una quincena: el 15, o el 1ero del mes siguiente. */
export function chargeDateOf(index: number): CivilDate {
  const year = Math.floor(index / 24);
  const rest = index - year * 24;
  const month = Math.floor(rest / 2) + 1;
  const half = rest % 2;

  if (half === 0) {
    return { year, month, day: 15 };
  }
  return month === 12
    ? { year: year + 1, month: 1, day: 1 }
    : { year, month: month + 1, day: 1 };
}

export function civilToIso(d: CivilDate): string {
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

export function chargeDateIso(index: number): string {
  return civilToIso(chargeDateOf(index));
}

/** Índice de la quincena a partir de su fecha de cobro guardada. */
export function quincenaFromChargeDate(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);

  if (day === 1) {
    // Cobrar el 1ero es cerrar la segunda mitad del mes anterior.
    return month === 1
      ? quincenaIndex(year - 1, 12, 1)
      : quincenaIndex(year, month - 1, 1);
  }
  return quincenaIndex(year, month, 0);
}

/** "15 de ago" · "1 de sep" */
export function quincenaLabel(index: number): string {
  const { month, day } = chargeDateOf(index);
  return `${day} de ${MESES_CORTOS[month - 1]}`;
}

/** "Quincena del 15 de agosto" */
export function quincenaLongLabel(index: number): string {
  const { month, day } = chargeDateOf(index);
  return `Quincena del ${day} de ${MESES_LARGOS[month - 1]}`;
}

/**
 * En qué jornada de cobro cayó una fecha. Sirve para etiquetar un abono ya
 * registrado: no depende de "ahora", así que es estable entre servidor y
 * navegador.
 */
export function quincenaLabelForDate(iso: string | Date): string {
  return quincenaLabel(currentQuincena(new Date(iso)));
}

/** Días que faltan para que se cobre una quincena (0 = hoy o ya pasó). */
export function daysUntilCharge(index: number, now: Date = new Date()): number {
  const target = Date.parse(`${chargeDateIso(index)}T00:00:00-04:00`);
  const today = Date.parse(`${caracasDateStr(now)}T00:00:00-04:00`);
  return Math.max(0, Math.round((target - today) / 86_400_000));
}

// ------------------------------------------------------------------
// Estado de cobranza de una venta
// ------------------------------------------------------------------

export type CobranzaState =
  /** Se saltó una o más quincenas anteriores. */
  | "ATRASADO"
  /** Le toca la cuota de esta quincena y todavía no la ha puesto. */
  | "TOCA_AHORA"
  /** Pagó hasta la quincena vigente; no le toca nada por ahora. */
  | "AL_DIA"
  /** El primer cobro es en una quincena futura. */
  | "POR_EMPEZAR"
  | "SALDADO";

export interface SaleForSchedule {
  total_amount: number;
  amount_paid: number;
  installment_amount: number;
  installments_count: number;
  first_charge_date: string | null;
}

export interface CobranzaSchedule {
  state: CobranzaState;
  /** Cuotas que ya debería haber puesto, contando la de esta quincena. */
  due: number;
  /** Cuotas cubiertas por lo que lleva abonado. */
  paidInstallments: number;
  /** Quincenas que se saltó (0 = al día). */
  behind: number;
  /** Lo que le toca poner en esta quincena, arrastres incluidos. */
  dueNow: number;
  /** Índice de la quincena del primer cobro. */
  firstQuincena: number;
  /** Saldo total que resta de la venta. */
  remaining: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function saleSchedule(
  sale: SaleForSchedule,
  now: Date = new Date()
): CobranzaSchedule {
  const total = Number(sale.total_amount);
  const paid = Number(sale.amount_paid);
  const cuota = Number(sale.installment_amount);
  const count = Number(sale.installments_count);
  const remaining = round2(Math.max(0, total - paid));

  // Las ventas anteriores al modelo de quincenas se cobran desde ya.
  const firstQuincena = sale.first_charge_date
    ? quincenaFromChargeDate(sale.first_charge_date)
    : currentQuincena(now);

  const base: CobranzaSchedule = {
    state: "AL_DIA",
    due: 0,
    paidInstallments: 0,
    behind: 0,
    dueNow: 0,
    firstQuincena,
    remaining,
  };

  if (remaining <= 0) {
    return { ...base, state: "SALDADO" };
  }

  const current = currentQuincena(now);

  if (current < firstQuincena) {
    return { ...base, state: "POR_EMPEZAR" };
  }

  const due = Math.min(current - firstQuincena + 1, count);

  // +1e-6 para que 66.66 / 33.33 no se caiga a 1 por el redondeo del decimal.
  const paidInstallments =
    cuota > 0 ? Math.floor(paid / cuota + 1e-6) : paid > 0 ? count : 0;

  // El atraso se cuenta desde que venció la cuota más vieja sin pagar, no
  // contra el número de cuotas: si no, una venta impaga desde agosto diría
  // "atrasado 1 quincena" en octubre, porque solo tenía 2 cuotas.
  // La de ESTA quincena no es atraso todavía: recién le toca.
  const oldestUnpaid = firstQuincena + Math.min(paidInstallments, count - 1);
  const behind = Math.max(0, current - oldestUnpaid);

  // En la última cuota se cobra el saldo entero, así no queda colgando el
  // centavo que deja el redondeo de total/cuotas.
  const target = due >= count ? total : round2(due * cuota);
  const dueNow = round2(Math.min(remaining, Math.max(0, target - paid)));

  let state: CobranzaState = "AL_DIA";
  if (behind > 0) state = "ATRASADO";
  else if (dueNow > 0) state = "TOCA_AHORA";

  return {
    state,
    due,
    paidInstallments,
    behind,
    dueNow,
    firstQuincena,
    remaining,
  };
}

export const COBRANZA_STATE_LABELS: Record<CobranzaState, string> = {
  ATRASADO: "Atrasado",
  TOCA_AHORA: "Toca esta quincena",
  AL_DIA: "Al día",
  POR_EMPEZAR: "Por empezar",
  SALDADO: "Saldado",
};

/** "Atrasado 2 quincenas" · "Toca esta quincena" · "Empieza el 1 de sep" */
export function cobranzaBadgeLabel(schedule: CobranzaSchedule): string {
  switch (schedule.state) {
    case "ATRASADO":
      return `Atrasado ${schedule.behind} quincena${schedule.behind === 1 ? "" : "s"}`;
    case "TOCA_AHORA":
      return "Toca esta quincena";
    case "POR_EMPEZAR":
      return `Empieza el ${quincenaLabel(schedule.firstQuincena)}`;
    case "SALDADO":
      return "Saldado";
    default:
      return "Al día";
  }
}

export const COBRANZA_STATE_STYLES: Record<CobranzaState, string> = {
  ATRASADO:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  TOCA_AHORA:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  AL_DIA:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  POR_EMPEZAR:
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  SALDADO:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
};
