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

/** El código de Venezuela, sin el más. */
const VENEZUELA = "58";

/**
 * El teléfono en forma internacional —código de país y nada más—, o null
 * si no se pudo reconocer.
 *
 * EL PROBLEMA QUE ARREGLA
 *
 * Antes esto solo borraba lo que no fuera dígito. Un número guardado como
 * `+584125556666` salía bien y uno guardado como `04125556666` —que es
 * como lo escribe todo el mundo en Venezuela— salía tal cual, y `wa.me`
 * no lo reconoce: ese 0 de adelante es el prefijo para llamar DENTRO del
 * país y no existe en el número internacional. El recordatorio se armaba
 * entero, el enlace se abría, y WhatsApp decía que el número no es
 * válido. La tienda se enteraba delante del cliente.
 *
 * LAS FORMAS QUE ENTIENDE
 *
 *   0412 555 6666      ->  584125556666    el formato de toda la vida
 *   +58 412 555 6666   ->  584125556666    ya venía bien
 *   58 412 555 6666    ->  584125556666    ya venía bien
 *   +58 0412 555 6666  ->  584125556666    el que escribe las dos cosas
 *   0058 412 555 6666  ->  584125556666    el 00 de marcar al exterior
 *   412 555 6666       ->  584125556666    sin el 0 de adelante
 *
 * LO QUE NO TOCA, Y POR QUÉ
 *
 * Un número escrito con `+` se respeta como esté: es la señal de que
 * alguien puso a propósito un país que no es Venezuela. Sin esa señal no
 * hay forma de distinguir un `412` de Digitel de un `412` de Pittsburgh,
 * así que se asume Venezuela, que es donde están los clientes de esta
 * aplicación. Quien tenga un cliente en el exterior lo guarda con su `+`
 * y esto no se mete.
 *
 * Devuelve null —y no un número a medias— cuando no encaja en ninguna
 * forma conocida. Quien llama decide qué hacer con eso; inventar un
 * número es peor que no tenerlo.
 */
function internacional(phone: string): string | null {
  let digitos = phone.replace(/\D/g, "");
  if (!digitos) return null;

  // El `00` es el prefijo para marcar al exterior: dice lo mismo que el
  // `+` y hay que quitarlo antes de mirar el resto.
  const conPrefijo = /^\s*\+/.test(phone) || digitos.startsWith("00");
  if (digitos.startsWith("00")) digitos = digitos.slice(2);

  // Ya viene completo: 58 + área + abonado.
  if (/^58[24]\d{9}$/.test(digitos)) return digitos;

  // El código de país Y el 0 nacional, los dos. Sobra el 0.
  if (/^580[24]\d{9}$/.test(digitos)) return VENEZUELA + digitos.slice(3);

  // Un país que no es Venezuela, escrito a propósito.
  if (conPrefijo) return digitos;

  // El formato venezolano de siempre: 0 + área + abonado, once dígitos.
  if (/^0[24]\d{9}$/.test(digitos)) return VENEZUELA + digitos.slice(1);

  // Un celular sin el 0 de adelante. Solo celulares: un fijo escrito así
  // se parece demasiado a un número de otro país y no vale el riesgo.
  if (/^4\d{9}$/.test(digitos)) return VENEZUELA + digitos;

  return null;
}

/**
 * El teléfono como lo quiere WhatsApp: código de país adelante y ni un
 * signo más. Si no se reconoce, devuelve los dígitos pelados, que es lo
 * que hacía antes: ningún número que hoy funciona puede empeorar.
 *
 * También la usa el alta de clientes para no duplicar: con esto, la misma
 * persona guardada una vez como `0412...` y otra como `+58412...` por fin
 * se reconoce como una sola.
 */
export function normalizePhone(phone: string | null | undefined) {
  if (!phone) return "";
  return internacional(phone) ?? phone.replace(/\D/g, "");
}

/**
 * El enlace del botón de llamar.
 *
 * Existe aparte de `normalizePhone` por una diferencia que parece un
 * detalle y no lo es: `wa.me` quiere el número SIN el más y `tel:` lo
 * quiere CON el más. Un `tel:584125556666` pelado el teléfono lo marca
 * como si fuera un número local venezolano —doce dígitos que no son de
 * nadie— y la llamada no entra.
 *
 * Cuando el número no se reconoce se manda tal cual venía. Es lo que se
 * hacía siempre y funciona para marcar dentro del país.
 */
export function phoneCallHref(phone: string | null | undefined) {
  if (!phone) return "";
  const bueno = internacional(phone);
  if (bueno) return `tel:+${bueno}`;
  const digitos = phone.replace(/\D/g, "");
  return digitos ? `tel:${digitos}` : "";
}
