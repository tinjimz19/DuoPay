import {
  CheckCheck,
  HandCoins,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_LABELS } from "@/lib/labels";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ProductCategory } from "@/types/database.types";

export const dynamic = "force-dynamic";

const CARACAS_OFFSET_MS = 4 * 60 * 60 * 1000;

function caracasDateStr(d: Date) {
  return new Date(d.getTime() - CARACAS_OFFSET_MS).toISOString().slice(0, 10);
}

function formatDay(day: string) {
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${day}T12:00:00-04:00`));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface PaymentRow {
  amount: number;
  created_at: string;
  sales: { category: ProductCategory } | null;
}

interface OpenSaleRow {
  total_amount: number;
  amount_paid: number;
}

interface CompletedSaleRow {
  payments: { created_at: string }[] | null;
}

interface SaleRow {
  total_amount: number;
  amount_paid: number;
  status: string;
  clients: { id: string; name: string } | null;
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string };
}) {
  const supabase = createClient();

  const todayStr = caracasDateStr(new Date());
  const firstOfMonthStr = todayStr.slice(0, 8) + "01";

  const desdeStr = DATE_RE.test(searchParams.desde ?? "")
    ? (searchParams.desde as string)
    : firstOfMonthStr;
  const hastaStr = DATE_RE.test(searchParams.hasta ?? "")
    ? (searchParams.hasta as string)
    : todayStr;

  const desdeIso = new Date(`${desdeStr}T00:00:00-04:00`).toISOString();
  const hastaIso = new Date(`${hastaStr}T23:59:59-04:00`).toISOString();

  const [
    { data: paymentsData },
    { data: openSalesData },
    { data: completedData },
    { data: allSalesData },
    { data: newClientsData },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select("amount, created_at, sales(category)")
      .gte("created_at", desdeIso)
      .lte("created_at", hastaIso),
    supabase
      .from("sales")
      .select("total_amount, amount_paid, status")
      .neq("status", "COMPLETED"),
    supabase
      .from("sales")
      .select("status, payments(created_at)")
      .eq("status", "COMPLETED"),
    supabase
      .from("sales")
      .select("total_amount, amount_paid, status, clients(id, name)"),
    supabase
      .from("clients")
      .select("id")
      .gte("created_at", desdeIso)
      .lte("created_at", hastaIso),
  ]);

  const payments = (paymentsData ?? []) as unknown as PaymentRow[];

  const cobradoTotal = payments.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  const dayMap = new Map<string, number>();
  for (const p of payments) {
    const day = new Date(
      new Date(p.created_at).getTime() - CARACAS_OFFSET_MS
    )
      .toISOString()
      .slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + Number(p.amount));
  }
  const perDay = Array.from(dayMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const maxDay = Math.max(0, ...perDay.map(([, amount]) => amount));

  const catMap = new Map<ProductCategory, number>();
  for (const p of payments) {
    const cat = p.sales?.category ?? "OTRO";
    catMap.set(cat, (catMap.get(cat) ?? 0) + Number(p.amount));
  }
  const perCategory = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(0, ...perCategory.map(([, amount]) => amount));

  const openSales = (openSalesData ?? []) as unknown as OpenSaleRow[];
  const quedaEnFiado = openSales.reduce(
    (sum, s) =>
      sum + (Number(s.total_amount) - Number(s.amount_paid)),
    0
  );
  const fiadosActivos = openSales.length;

  const completedSales = (completedData ?? []) as unknown as CompletedSaleRow[];
  let saldadosEnRango = 0;
  for (const s of completedSales) {
    const pays = (s.payments ?? []).map((p) =>
      new Date(p.created_at).getTime()
    );
    if (!pays.length) continue;
    const lastStr = caracasDateStr(new Date(Math.max(...pays)));
    if (lastStr >= desdeStr && lastStr <= hastaStr) saldadosEnRango++;
  }

  const salesRows = (allSalesData ?? []) as unknown as SaleRow[];
  const purchases = new Map<string, { name: string; total: number }>();
  const debts = new Map<string, { name: string; debt: number }>();
  for (const s of salesRows) {
    const client = s.clients;
    if (!client) continue;
    const total = Number(s.total_amount);
    const prev = purchases.get(client.id);
    if (prev) prev.total += total;
    else purchases.set(client.id, { name: client.name, total });
    if (s.status !== "COMPLETED") {
      const remaining = total - Number(s.amount_paid);
      const d = debts.get(client.id);
      if (d) d.debt += remaining;
      else debts.set(client.id, { name: client.name, debt: remaining });
    }
  }
  const topClientes = Array.from(purchases.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const maxCompra = Math.max(0, ...topClientes.map((c) => c.total));
  const topDeudores = Array.from(debts.values())
    .filter((d) => d.debt > 0)
    .sort((a, b) => b.debt - a.debt)
    .slice(0, 10);
  const maxDeuda = Math.max(0, ...topDeudores.map((d) => d.debt));

  const clientesNuevos = newClientsData?.length ?? 0;

  const kpis = [
    {
      label: "Cobrado en el rango",
      value: formatCurrency(cobradoTotal),
      icon: TrendingUp,
      valueClass: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Queda en fiado",
      value: formatCurrency(quedaEnFiado),
      icon: HandCoins,
      valueClass: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Fiados activos",
      value: String(fiadosActivos),
      icon: ShoppingBag,
      valueClass: "text-sky-600 dark:text-sky-400",
    },
    {
      label: "Fiados saldados",
      value: String(saldadosEnRango),
      icon: CheckCheck,
      valueClass: "text-violet-600 dark:text-violet-400",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Reportes
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Del {formatDate(`${desdeStr}T00:00:00-04:00`)} al{" "}
          {formatDate(`${hastaStr}T00:00:00-04:00`)} ·{" "}
          {clientesNuevos} cliente{clientesNuevos === 1 ? "" : "s"} nuevo
          {clientesNuevos === 1 ? "" : "s"}
        </p>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="desde" className="text-xs text-slate-500 dark:text-slate-400">
                Desde
              </Label>
              <Input
                type="date"
                id="desde"
                name="desde"
                defaultValue={desdeStr}
                className="h-11 w-44"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hasta" className="text-xs text-slate-500 dark:text-slate-400">
                Hasta
              </Label>
              <Input
                type="date"
                id="hasta"
                name="hasta"
                defaultValue={hastaStr}
                className="h-11 w-44"
              />
            </div>
            <Button type="submit" className="h-11">
              Aplicar
            </Button>
          </form>
        </CardContent>
      </Card>

      <section>
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

      {payments.length === 0 && perDay.length === 0 ? (
        <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No hay pagos registrados en este rango de fechas.
          </CardContent>
        </Card>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Cobrado por día
            </h2>
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <CardContent className="space-y-2 p-4">
                {perDay.map(([day, amount]) => {
                  const pct = maxDay > 0 ? amount / maxDay : 0;
                  return (
                    <div key={day} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        {formatDay(day)}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${Math.max(pct * 100, amount > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs font-medium text-slate-700 dark:text-slate-300">
                        {formatCurrency(amount)}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </section>

          {perCategory.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Cobrado por categoría
              </h2>
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <CardContent className="space-y-2 p-4">
                  {perCategory.map(([category, amount]) => {
                    const pct = maxCategory > 0 ? amount / maxCategory : 0;
                    return (
                      <div key={category} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-xs text-slate-500 dark:text-slate-400">
                          {CATEGORY_LABELS[category]}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-sky-500"
                            style={{ width: `${Math.max(pct * 100, amount > 0 ? 4 : 0)}%` }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right text-xs font-medium text-slate-700 dark:text-slate-300">
                          {formatCurrency(amount)}
                        </span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </section>
          )}
        </>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Clientes con más compras
        </h2>
        {topClientes.length === 0 ? (
          <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Aún no hay ventas registradas.
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="space-y-2 p-4">
              {topClientes.map((c, i) => {
                const pct = maxCompra > 0 ? c.total / maxCompra : 0;
                return (
                  <div key={c.name} className="flex items-center gap-3">
                    <span className="w-6 shrink-0 text-center text-sm font-bold text-slate-400 dark:text-slate-500">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                      {c.name}
                    </span>
                    <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-slate-100 sm:block dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${Math.max(pct * 100, 4)}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatCurrency(c.total)}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Clientes con mayor deuda
        </h2>
        {topDeudores.length === 0 ? (
          <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No hay deudas pendientes. ¡Todo saldado!
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="space-y-2 p-4">
              {topDeudores.map((c, i) => {
                const pct = maxDeuda > 0 ? c.debt / maxDeuda : 0;
                return (
                  <div key={c.name} className="flex items-center gap-3">
                    <span className="w-6 shrink-0 text-center text-sm font-bold text-slate-400 dark:text-slate-500">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                      {c.name}
                    </span>
                    <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-slate-100 sm:block dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${Math.max(pct * 100, 4)}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-amber-600 dark:text-amber-400">
                      {formatCurrency(c.debt)}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
