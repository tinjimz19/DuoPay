import {
  BarChart3,
  ChevronRight,
  Package,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { getEuroRate } from "@/actions/rates";
import { RateCard } from "@/components/rates/rate-card";
import { SaleStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { caracasDateStr, formatCurrency } from "@/lib/format";
import {
  currentQuincena,
  daysUntilCharge,
  nextQuincena,
  quincenaLabel,
  quincenaLongLabel,
  saleSchedule,
} from "@/lib/quincenas";

export const dynamic = "force-dynamic";

/**
 * Inicio responde tres preguntas, en este orden y con este peso:
 *   1. ¿Qué tengo que cobrar hoy?   -> el hero, la única pieza grande
 *   2. ¿Cómo va el negocio?          -> dos cifras, no cuatro
 *   3. ¿A dónde voy ahora?           -> accesos compactos
 *
 * Lo que antes eran 14 tarjetas del mismo peso ahora son 6 bloques con
 * jerarquía: el aire agrupa, en vez de que cada dato traiga su propio borde.
 */
export default async function DashboardPage() {
  const supabase = createClient();

  let initialRate: Awaited<ReturnType<typeof getEuroRate>> | null = null;
  try {
    initialRate = await getEuroRate();
  } catch {
    initialRate = null;
  }

  // El mes arranca a medianoche de Caracas, no del servidor (UTC en Vercel):
  // si no, las últimas 4 horas del mes anterior se cuentan en este.
  const startOfMonth = new Date(
    `${caracasDateStr().slice(0, 8)}01T00:00:00-04:00`
  );

  // Ojo: la lista de "ventas recientes" está limitada, así que NO sirve para
  // los totales. Cada cifra se consulta sobre todas las ventas.
  const [
    { data: recentSales },
    { data: openSales },
    { count: completedCount },
    { data: monthPayments },
    { count: pendingPreorders },
  ] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, item_description, total_amount, amount_paid, status, created_at, clients(id, name)"
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("sales")
      .select(
        "total_amount, amount_paid, installment_amount, installments_count, first_charge_date, client_id"
      )
      .is("deleted_at", null)
      .neq("status", "COMPLETED"),
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "COMPLETED"),
    supabase
      .from("payments")
      .select("amount")
      .is("deleted_at", null)
      .gte("created_at", startOfMonth.toISOString()),
    supabase
      .from("preorders")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "PENDENT"),
  ]);

  const salesList = recentSales ?? [];
  const carteraTotal = (openSales ?? []).reduce(
    (sum, s) => sum + (Number(s.total_amount) - Number(s.amount_paid)),
    0
  );
  const monthCollected = (monthPayments ?? []).reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  // Lo que toca cobrar en esta jornada, y a cuánta gente.
  const clientesPorCobrar = new Set<string>();
  let atrasadas = 0;
  let quincenaTotal = 0;
  for (const sale of openSales ?? []) {
    const schedule = saleSchedule({
      total_amount: Number(sale.total_amount),
      amount_paid: Number(sale.amount_paid),
      installment_amount: Number(sale.installment_amount),
      installments_count: sale.installments_count,
      first_charge_date: sale.first_charge_date,
    });
    if (schedule.dueNow <= 0) continue;
    quincenaTotal += schedule.dueNow;
    clientesPorCobrar.add(sale.client_id);
    if (schedule.behind > 0) atrasadas += 1;
  }
  quincenaTotal = Math.round((quincenaTotal + Number.EPSILON) * 100) / 100;

  const proxima = nextQuincena();
  const diasParaLaProxima = daysUntilCharge(proxima);

  // Los contadores sueltos viven donde se actúa sobre ellos, no como métrica.
  const accesos = [
    {
      href: "/pedidos",
      label: "Pedidos",
      icon: Package,
      hint:
        (pendingPreorders ?? 0) > 0
          ? `${pendingPreorders} por comprar`
          : "Nada pendiente",
      urgent: (pendingPreorders ?? 0) > 0,
    },
    {
      href: "/reportes",
      label: "Reportes",
      icon: BarChart3,
      hint: `${completedCount ?? 0} cuenta${completedCount === 1 ? "" : "s"} saldada${completedCount === 1 ? "" : "s"}`,
      urgent: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── 1. Lo del día ────────────────────────────────────────────── */}
      <section>
        <Link href="/cobranza" className="block">
          <Card className="border-indigo-200 bg-indigo-50/70 transition-colors hover:bg-indigo-100/70 dark:border-indigo-900 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50">
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
                  {quincenaLongLabel(currentQuincena())}
                </p>
                {quincenaTotal > 0 ? (
                  <>
                    <p className="mt-1.5 text-3xl font-bold leading-none tracking-tight text-slate-900 dark:text-slate-100">
                      {formatCurrency(quincenaTotal)}
                    </p>
                    <p className="mt-2 truncate text-sm text-slate-600 dark:text-slate-400">
                      por cobrar a {clientesPorCobrar.size} cliente
                      {clientesPorCobrar.size === 1 ? "" : "s"}
                      {atrasadas > 0 && (
                        <>
                          {" · "}
                          <span className="font-semibold text-red-600 dark:text-red-400">
                            {atrasadas} atrasada{atrasadas === 1 ? "" : "s"}
                          </span>
                        </>
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1.5 text-xl font-bold text-slate-900 dark:text-slate-100">
                      Todo cobrado
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      Próximo cobro el {quincenaLabel(proxima)}
                      {diasParaLaProxima > 0
                        ? ` · en ${diasParaLaProxima} día${diasParaLaProxima === 1 ? "" : "s"}`
                        : " · hoy"}
                    </p>
                  </>
                )}
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-indigo-400" />
            </CardContent>
          </Card>
        </Link>

        {/* Pegada al hero a propósito: es el otro dato de "hoy". */}
        <div className="mt-2">
          <RateCard initial={initialRate} compact />
        </div>
      </section>

      {/* ── 2. Empezar algo ──────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3">
        <Button asChild className="h-14 text-sm">
          <Link href="/ventas/nueva">
            <Plus className="h-4 w-4" />
            Registrar venta
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-14 text-sm">
          <Link href="/pedidos?nuevo=1">
            <Plus className="h-4 w-4" />
            Anotar pedido
          </Link>
        </Button>
      </section>

      {/* ── 3. Cómo va ───────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3">
        <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Wallet className="h-3.5 w-3.5" />
              <p className="truncate text-xs">Cartera total</p>
            </div>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {formatCurrency(carteraTotal)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <TrendingUp className="h-3.5 w-3.5" />
              <p className="truncate text-xs">Cobrado este mes</p>
            </div>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatCurrency(monthCollected)}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ── 4. A dónde ir ────────────────────────────────────────────── */}
      <section>
        <Card className="divide-y divide-slate-200 border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {accesos.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                  {item.label}
                </span>
                <span
                  className={
                    item.urgent
                      ? "shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400"
                      : "shrink-0 text-xs text-slate-400 dark:text-slate-500"
                  }
                >
                  {item.hint}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
              </Link>
            );
          })}
        </Card>
      </section>

      {/* ── 5. Lo último que pasó ────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Ventas recientes
          </h2>
          <Link
            href="/ventas"
            className="shrink-0 text-sm font-medium text-indigo-600 dark:text-indigo-400"
          >
            Ver todas
          </Link>
        </div>

        {salesList.length === 0 ? (
          <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Aún no hay ventas registradas.
            </CardContent>
          </Card>
        ) : (
          // Una sola tarjeta con divisores: seis bordes sueltos no eran seis
          // grupos, eran ruido.
          <Card className="divide-y divide-slate-200 border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {salesList.map((sale) => {
              const client = sale.clients as unknown as {
                id: string;
                name: string;
              } | null;
              return (
                <Link
                  key={sale.id}
                  href={client ? `/clientes/${client.id}` : "/ventas"}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  {/* El cliente arriba y en grande, igual que en la lista
                      de ventas: uno reconoce la venta por la persona, no
                      por la mercancía. */}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {client?.name ?? "Cliente"}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {sale.item_description}
                    </p>
                  </div>
                  {/* El badge va primero y el monto de último, alineado a la
                      derecha: los badges tienen anchos distintos y si van al
                      final desalinean toda la columna de cifras. */}
                  <div className="flex shrink-0 items-center gap-2">
                    <SaleStatusBadge status={sale.status} />
                    <span className="min-w-[4.5rem] text-right text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(
                        Number(sale.total_amount) - Number(sale.amount_paid)
                      )}
                    </span>
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
