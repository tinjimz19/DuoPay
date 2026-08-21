import { CheckCheck, HandCoins, PackagePlus, TrendingUp } from "lucide-react";
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
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();

  let initialRate: Awaited<ReturnType<typeof getEuroRate>> | null = null;
  try {
    initialRate = await getEuroRate();
  } catch {
    initialRate = null;
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [{ data: sales }, { data: monthPayments }, { data: preorders }] =
    await Promise.all([
      supabase
        .from("sales")
        .select(
          "id, item_description, total_amount, amount_paid, status, created_at, clients(name)"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("payments")
        .select("amount")
        .is("deleted_at", null)
        .gte("created_at", startOfMonth.toISOString()),
      supabase
        .from("preorders")
        .select("id")
        .is("deleted_at", null)
        .eq("status", "PENDENT"),
    ]);

  const salesList = sales ?? [];
  const pendingTotal = salesList.reduce((sum, s) => {
    if (s.status === "PENDING" || s.status === "PARTIAL") {
      return sum + (Number(s.total_amount) - Number(s.amount_paid));
    }
    return sum;
  }, 0);
  const monthCollected = (monthPayments ?? []).reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );
  const completedCount = salesList.filter((s) => s.status === "COMPLETED").length;
  const pendingPreorders = preorders?.length ?? 0;

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
      value: String(completedCount),
      icon: CheckCheck,
      valueClass: "text-sky-600 dark:text-sky-400",
    },
    {
      label: "Pedidos pendientes",
      value: String(pendingPreorders),
      icon: PackagePlus,
      valueClass: "text-violet-600 dark:text-violet-400",
    },
  ];

  return (
    <div className="space-y-6">
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