import {
  BarChart3,
  CheckCheck,
  ChevronRight,
  HandCoins,
  Package,
  PackagePlus,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

import { getEuroRate } from "@/actions/rates";
import { RateCard } from "@/components/rates/rate-card";
import { SaleStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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

  // Ojo: la lista de "ventas recientes" está limitada a 6, así que NO sirve
  // para los totales. Cada KPI se consulta sobre todas las ventas.
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
        "id, item_description, total_amount, amount_paid, status, created_at, clients(name)"
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(6),
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
  const pendingTotal = (openSales ?? []).reduce(
    (sum, s) => sum + (Number(s.total_amount) - Number(s.amount_paid)),
    0
  );
  const monthCollected = (monthPayments ?? []).reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  // Lo que toca cobrar en esta jornada, y a cuánta gente.
  const clientesPorCobrar = new Set<string>();
  let atrasados = 0;
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
    if (schedule.behind > 0) atrasados += 1;
  }
  quincenaTotal = Math.round((quincenaTotal + Number.EPSILON) * 100) / 100;

  const proxima = nextQuincena();
  const diasParaLaProxima = daysUntilCharge(proxima);

  const kpis = [
    {
      label: "Por cobrar",
      value: formatCurrency(pendingTotal),
      icon: HandCoins,
      valueClass:
        "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Cobrado este mes",
      value: formatCurrency(monthCollected),
      icon: TrendingUp,
      valueClass:
        "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Cuentas saldadas",
      value: String(completedCount ?? 0),
      icon: CheckCheck,
      valueClass: "text-sky-600 dark:text-sky-400",
    },
    {
      label: "Pedidos pendientes",
      value: String(pendingPreorders ?? 0),
      icon: PackagePlus,
      valueClass: "text-violet-600 dark:text-violet-400",
    },
  ];

  return (
    <div className="space-y-6">
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
                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {formatCurrency(quincenaTotal)}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-400">
                      por cobrar a {clientesPorCobrar.size} cliente
                      {clientesPorCobrar.size === 1 ? "" : "s"}
                      {atrasados > 0 && (
                        <>
                          {" · "}
                          <span className="font-semibold text-red-600 dark:text-red-400">
                            {atrasados} atrasada{atrasados === 1 ? "" : "s"}
                          </span>
                        </>
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Todo cobrado
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
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
      </section>

      <section>
        <RateCard initial={initialRate} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Resumen
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card
                key={kpi.label}
                className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Icon className="h-4 w-4" />
                    <p className="text-xs">{kpi.label}</p>
                  </div>
                  <p className={`mt-2 text-2xl font-bold ${kpi.valueClass}`}>
                    {kpi.value}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Acciones rápidas
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Button asChild className="h-14 text-sm">
            <Link href="/ventas/nueva">+ Registrar entrega</Link>
          </Button>
          <Button asChild variant="outline" className="h-14 text-sm">
            <Link href="/pedidos?nuevo=1">+ Anotar pedido</Link>
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {[
            { href: "/pedidos", label: "Pedidos", icon: Package },
            { href: "/reportes", label: "Reportes", icon: BarChart3 },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/50"
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-slate-400" />
                  {item.label}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Ventas recientes
          </h2>
          <Link
            href="/ventas"
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
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
          <div className="space-y-2">
            {salesList.map((sale) => (
              <Link key={sale.id} href="/ventas" className="block">
                <Card className="border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {sale.item_description}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {(sale.clients as unknown as { name: string } | null)
                          ?.name ?? "Cliente"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <SaleStatusBadge status={sale.status} />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatCurrency(
                          Number(sale.total_amount) - Number(sale.amount_paid)
                        )}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}