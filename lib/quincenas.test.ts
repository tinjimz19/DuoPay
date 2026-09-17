/**
 * Pruebas de la aritmética de quincenas.
 *
 *   npx tsx lib/quincenas.test.ts
 *
 * No tocan la base de datos: son puro cálculo. Si algo se rompe, lanza.
 */
import {
  FIRST_CHARGE_CHOICES,
  chargeDateIso,
  esPagoUnicoEnFecha,
  fechaCorta,
  inicioLabel,
  cobranzaBadgeLabel,
  currentQuincena,
  daysUntilCharge,
  quincenaFromChargeDate,
  quincenaIndex,
  quincenaLabel,
  firstChargeOptions,
  quincenaLabelForDate,
  saleSchedule,
  type SaleForSchedule,
} from "./quincenas";

let fails = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FALLO ${label}: obtuve ${JSON.stringify(got)}, esperaba ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label} -> ${JSON.stringify(got)}`);
}
// Mediodía de Caracas para no bailar con el huso.
const at = (iso: string) => new Date(`${iso}T12:00:00-04:00`);

console.log("--- quincena vigente ---");
eq("22 ago -> cobro del 15 ago", chargeDateIso(currentQuincena(at("2026-08-22"))), "2026-08-15");
eq("15 ago (mismo día de cobro)", chargeDateIso(currentQuincena(at("2026-08-15"))), "2026-08-15");
eq("14 ago -> todavía el del 1 ago", chargeDateIso(currentQuincena(at("2026-08-14"))), "2026-08-01");
eq("3 sep -> cobro del 1 sep", chargeDateIso(currentQuincena(at("2026-09-03"))), "2026-09-01");
eq("31 ago -> cobro del 15 ago", chargeDateIso(currentQuincena(at("2026-08-31"))), "2026-08-15");
console.log("--- bordes de año y febrero ---");
eq("3 ene 2027 -> cobro del 1 ene", chargeDateIso(currentQuincena(at("2027-01-03"))), "2027-01-01");
eq("20 dic -> cobro del 15 dic", chargeDateIso(currentQuincena(at("2026-12-20"))), "2026-12-15");
eq("dic 2da mitad se cobra el 1 ene", chargeDateIso(quincenaIndex(2026, 12, 1)), "2027-01-01");
eq("28 feb -> cobro del 15 feb", chargeDateIso(currentQuincena(at("2027-02-28"))), "2027-02-15");
eq("feb 2da mitad se cobra el 1 mar", chargeDateIso(quincenaIndex(2027, 2, 1)), "2027-03-01");
console.log("--- ida y vuelta fecha <-> índice ---");
for (const iso of ["2026-08-15","2026-09-01","2027-01-01","2026-12-15","2027-03-01"]) {
  eq(`roundtrip ${iso}`, chargeDateIso(quincenaFromChargeDate(iso)), iso);
}
eq("etiqueta", quincenaLabel(quincenaIndex(2026, 9, 0)), "15 de sep");
eq("faltan 6 días para el 1 sep desde el 26 ago",
   daysUntilCharge(quincenaFromChargeDate("2026-09-01"), at("2026-08-26")), 6);

console.log("--- estado de cobranza ---");
const venta = (paid: number, first: string, count = 2, total = 100) => ({
  total_amount: total, amount_paid: paid,
  installment_amount: Math.round((total / count) * 100) / 100,
  installments_count: count, first_charge_date: first,
});
let s = saleSchedule(venta(0, "2026-08-15"), at("2026-08-22"));
eq("recién le toca la 1ra", [s.state, s.behind, s.dueNow], ["TOCA_AHORA", 0, 50]);
s = saleSchedule(venta(50, "2026-08-15"), at("2026-08-22"));
eq("puso la de esta quincena", [s.state, s.behind, s.dueNow], ["AL_DIA", 0, 0]);
s = saleSchedule(venta(0, "2026-08-15"), at("2026-09-05"));
eq("se saltó una quincena", [s.state, s.behind, s.dueNow], ["ATRASADO", 1, 100]);
s = saleSchedule(venta(50, "2026-08-15"), at("2026-09-05"));
eq("va al día en la 2da", [s.state, s.behind, s.dueNow], ["TOCA_AHORA", 0, 50]);
s = saleSchedule(venta(0, "2026-09-01"), at("2026-08-22"));
eq("todavía no empieza", [s.state, s.dueNow], ["POR_EMPEZAR", 0]);
s = saleSchedule(venta(100, "2026-08-15"), at("2026-09-05"));
eq("saldada", [s.state, s.dueNow], ["SALDADO", 0]);
eq("etiqueta de atraso",
   cobranzaBadgeLabel(saleSchedule(venta(0, "2026-08-15"), at("2026-10-20"))),
   "Atrasado 4 quincenas");

console.log("--- redondeo: 100 en 3 cuotas de 33.33 ---");
const v3 = (paid: number) => venta(paid, "2026-08-15", 3, 100);
s = saleSchedule(v3(0), at("2026-08-22"));
eq("1ra cuota", s.dueNow, 33.33);
s = saleSchedule(v3(66.66), at("2026-09-05"));
eq("dos cuotas puestas, va al día", [s.state, s.paidInstallments], ["AL_DIA", 2]);
s = saleSchedule(v3(66.66), at("2026-09-20"));
eq("la última cuota se lleva el centavo", s.dueNow, 33.34);
s = saleSchedule(v3(66.66), at("2026-11-20"));
eq("atraso se mide desde la cuota vencida más vieja", [s.behind, s.dueNow], [4, 33.34]);


console.log("--- atraso largo ---");
s = saleSchedule(venta(0, "2026-08-15"), at("2026-10-20"));
eq("impaga desde ago, en oct", [s.state, s.behind], ["ATRASADO", 4]);
s = saleSchedule(venta(50, "2026-08-15"), at("2026-10-20"));
eq("puso una en ago, en oct", [s.state, s.behind], ["ATRASADO", 3]);
s = saleSchedule(venta(0, "2026-08-15"), at("2027-08-20"));
eq("un año entero sin pagar", [s.state, s.behind, s.dueNow], ["ATRASADO", 24, 100]);
s = saleSchedule({ total_amount: 80, amount_paid: 20, installment_amount: 20, installments_count: 4, first_charge_date: null }, at("2026-08-22"));
eq("venta vieja sin quincena asignada no sale atrasada", [s.state, s.behind], ["AL_DIA", 0]);

console.log("--- etiqueta de la jornada en que cayó un abono ---");
eq("abono del 22 ago", quincenaLabelForDate("2026-08-22T15:00:00-04:00"), "15 de ago");
eq("abono del 3 sep",  quincenaLabelForDate("2026-09-03T09:00:00-04:00"), "1 de sep");
eq("abono del 14 ago", quincenaLabelForDate("2026-08-14T23:00:00-04:00"), "1 de ago");
eq("abono del 2 ene",  quincenaLabelForDate("2027-01-02T09:00:00-04:00"), "1 de ene");

console.log("\n--- monto que ofrece el botón Adelantar (misma fórmula que el server) ---");
const ventaN = (paid: number, count: number, total: number, first: string) => ({
  total_amount: total, amount_paid: paid,
  installment_amount: Math.round((total / count) * 100) / 100,
  installments_count: count, first_charge_date: first,
});
function adelanto(v: SaleForSchedule & { installment_amount: number }, dia: string) {
  const s = saleSchedule(v, at(dia));
  return s.dueNow <= 0 && s.remaining > 0
    ? Math.min(v.installment_amount, s.remaining) : 0;
}
// venta que aún no arranca: el hueco que estábamos tapando
eq("no arrancada, ofrece 1 cuota", adelanto(ventaN(0, 2, 100, "2026-09-01"), "2026-08-22"), 50);
// ya adelantó dos quincenas: puede seguir adelantando la tercera
eq("ya al día, ofrece la siguiente", adelanto(ventaN(100, 3, 150, "2026-08-15"), "2026-09-02"), 50);
// última cuota: no ofrece más que el saldo
eq("no ofrece más que el saldo", adelanto(ventaN(130, 3, 150, "2026-08-15"), "2026-08-16"), 20);
// si le toca pagar, no es adelanto
eq("si le toca, no hay adelanto", adelanto(ventaN(0, 2, 100, "2026-08-15"), "2026-08-22"), 0);
// saldada
eq("saldada no ofrece nada", adelanto(ventaN(100, 2, 100, "2026-08-15"), "2026-08-22"), 0);

const resumenFC = (dia: string) =>
  firstChargeOptions(3, at(dia)).map(
    (o) => `${o.label} (${o.daysAway === 0 ? "ya" : o.daysAway + "d"})`
  );
const fechasFC = (dia: string) =>
  firstChargeOptions(3, at(dia)).map((o) =>
    chargeDateIso(currentQuincena(at(dia)) + o.offset)
  );

console.log("\n=== OPCIONES DE PRIMER COBRO ===");
console.log("--- estamos en la quincena del 15 de ago (hoy 22 ago) ---");
eq("las tres opciones", resumenFC("2026-08-22"), ["15 de ago (ya)", "1 de sep (10d)", "15 de sep (24d)"]);
eq("fechas que guardaría el servidor", fechasFC("2026-08-22"), ["2026-08-15", "2026-09-01", "2026-09-15"]);

console.log("\n--- justo el día de cobro (15 ago) ---");
eq("opciones", resumenFC("2026-08-15"), ["15 de ago (ya)", "1 de sep (17d)", "15 de sep (31d)"]);

console.log("\n--- antes del 15: la vigente es la del 1ero ---");
eq("opciones el 3 de ago", resumenFC("2026-08-03"), ["1 de ago (ya)", "15 de ago (12d)", "1 de sep (29d)"]);

console.log("\n--- cruce de año ---");
eq("opciones el 20 de dic", resumenFC("2026-12-20"), ["15 de dic (ya)", "1 de ene (12d)", "15 de ene (26d)"]);
eq("fechas el 20 de dic", fechasFC("2026-12-20"), ["2026-12-15", "2027-01-01", "2027-01-15"]);

console.log("\n--- febrero ---");
eq("opciones el 20 de feb 2027", resumenFC("2027-02-20"), ["15 de feb (ya)", "1 de mar (9d)", "15 de mar (23d)"]);


console.log("\n--- PAGO ÚNICO EN FECHA EXACTA ---");
// El cliente que paga todo de una vez y dice "el 25".
const unico = (paid: number, dia: string, total = 100) => ({
  total_amount: total, amount_paid: paid, installment_amount: total,
  installments_count: 1, first_charge_date: dia,
});

eq("una cuota con fecha ES pago único", esPagoUnicoEnFecha(unico(0, "2026-09-25")), true);
eq("dos cuotas NO lo son",
   esPagoUnicoEnFecha({ total_amount: 100, amount_paid: 0, installment_amount: 50,
                        installments_count: 2, first_charge_date: "2026-09-15" }), false);
eq("una cuota sin fecha tampoco",
   esPagoUnicoEnFecha({ total_amount: 100, amount_paid: 0, installment_amount: 100,
                        installments_count: 1, first_charge_date: null }), false);

s = saleSchedule(unico(0, "2026-09-25"), at("2026-09-20"));
eq("antes del día: por empezar", [s.state, s.dueNow, s.fechaFija],
   ["POR_EMPEZAR", 0, "2026-09-25"]);
eq("y lo dice con SU fecha, no con la quincena",
   cobranzaBadgeLabel(s), "Empieza el 25 de sep");

s = saleSchedule(unico(0, "2026-09-25"), at("2026-09-25"));
eq("el mismo día: toca todo", [s.state, s.dueNow, s.behind], ["TOCA_AHORA", 100, 0]);
eq("etiqueta el mismo día", cobranzaBadgeLabel(s), "Toca ahora");

s = saleSchedule(unico(0, "2026-09-25"), at("2026-09-28"));
eq("tres días después sigue tocando", [s.state, s.behind], ["TOCA_AHORA", 0]);

s = saleSchedule(unico(0, "2026-09-25"), at("2026-10-03"));
eq("pasó la jornada siguiente: vencido", [s.state, s.behind, s.dueNow],
   ["ATRASADO", 1, 100]);
eq("y lo dice por su fecha", cobranzaBadgeLabel(s), "Venció el 25 de sep");

s = saleSchedule(unico(100, "2026-09-25"), at("2026-10-03"));
eq("pagado queda saldado", [s.state, s.dueNow], ["SALDADO", 0]);
s = saleSchedule(unico(40, "2026-09-25"), at("2026-09-28"));
eq("abono parcial: queda debiendo el resto", [s.state, s.dueNow], ["TOCA_AHORA", 60]);

// El día 1ero, que es el otro caso que mencionó la tienda.
s = saleSchedule(unico(0, "2026-10-01"), at("2026-09-28"));
eq("pago único el 1ero, antes", [s.state, s.dueNow], ["POR_EMPEZAR", 0]);
s = saleSchedule(unico(0, "2026-10-01"), at("2026-10-01"));
eq("pago único el 1ero, llegado", [s.state, s.dueNow], ["TOCA_AHORA", 100]);

console.log("\n--- las ventas de UNA cuota que ya existían no cambian ---");
// Medir por día y medir por quincena dan el mismo resultado cuando la
// fecha es un 1 o un 15. Esto es lo que permite no agregar una columna.
s = saleSchedule(unico(0, "2026-08-15"), at("2026-08-14"));
eq("15 ago, un día antes: no empieza", s.state, "POR_EMPEZAR");
s = saleSchedule(unico(0, "2026-08-15"), at("2026-08-15"));
eq("15 ago, el día: toca", [s.state, s.dueNow], ["TOCA_AHORA", 100]);
s = saleSchedule(unico(0, "2026-08-15"), at("2026-08-22"));
eq("15 ago, una semana después: sigue tocando", [s.state, s.behind], ["TOCA_AHORA", 0]);
s = saleSchedule(unico(0, "2026-08-15"), at("2026-09-05"));
eq("15 ago, en la jornada siguiente: atrasado", [s.state, s.behind], ["ATRASADO", 1]);

console.log("\n--- las ventas por quincenas siguen sin fecha fija ---");
s = saleSchedule(venta(0, "2026-08-15"), at("2026-08-22"));
eq("una venta de 2 cuotas no trae fechaFija", s.fechaFija, null);
eq("y su inicio se dice por quincena",
   inicioLabel(saleSchedule(venta(0, "2026-09-01"), at("2026-08-22"))), "1 de sep");
eq("el de un pago único, por su día",
   inicioLabel(saleSchedule(unico(0, "2026-09-25"), at("2026-09-20"))), "25 de sep");

console.log("\n--- fechaCorta ---");
eq("25 de septiembre", fechaCorta("2026-09-25"), "25 de sep");
eq("1 de enero", fechaCorta("2027-01-01"), "1 de ene");
eq("aguanta una marca de tiempo entera", fechaCorta("2026-12-03T10:00:00-04:00"), "3 de dic");

console.log("\n--- ahora se ofrecen CUATRO jornadas ---");
eq("la constante", FIRST_CHARGE_CHOICES, 4);
eq("cuatro opciones desde el 20 de ago",
   firstChargeOptions(FIRST_CHARGE_CHOICES, at("2026-08-20")).map((o) => o.label),
   ["15 de ago", "1 de sep", "15 de sep", "1 de oct"]);
eq("cruza el fin de año",
   firstChargeOptions(FIRST_CHARGE_CHOICES, at("2026-12-20")).map((o) => o.label),
   ["15 de dic", "1 de ene", "15 de ene", "1 de feb"]);


console.log(fails === 0 ? "\n=== TODO PASÓ ===" : `\n=== ${fails} FALLOS ===`);
if (fails > 0) throw new Error("hubo fallos");
