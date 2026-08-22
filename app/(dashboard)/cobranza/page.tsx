import { CalendarClock } from "lucide-react";

import { CobranzaList } from "@/components/cobranza/cobranza-list";
import type {
  CobranzaClient,
  CobranzaSaleRow,
} from "@/components/cobranza/cobranza-list";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import {
  currentQuincena,
  daysUntilCharge,
  nextQuincena,
  quincenaLabel,
  quincenaLongLabel,
  saleSchedule,
} from "@/lib/quincenas";
import { createClient } from "@/lib/supabase/server";
import type { ProductCategory } from "@/types/database.types";

export const dynamic = "force-dynamic";

interface SaleRow {
  id: string;
  item_description: string;
  category: ProductCategory;
  total_amount: number;
  amount_paid: number;
  installment_amount: number;
  installments_count: number;
  first_charge_date: string | null;
  clients: { id: string; name: string; phone: string } | null;
}

export default async function CobranzaPage() {
  const supabase = createClient();

  const [{ data: sales }, { data: profile }] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, item_description, category, total_amount, amount_paid, installment_amount, installments_count, first_charge_date, clients(id, name, phone)"
      )
      .is("deleted_at", null)
      .neq("status", "COMPLETED")
      .order("created_at", { ascending: true }),
    supabase.from("profiles").select("business_name").maybeSingle(),
  ]);

  const current = currentQuincena();
  const next = nextQuincena();
  const diasParaLaProxima = daysUntilCharge(next);

  // Se agrupa por CLIENTE, no por venta: en la calle uno visita personas.
  const byClient = new Map<string, CobranzaClient>();

  for (const raw of (sales ?? []) as unknown as SaleRow[]) {
    const client = raw.clients;
    if (!client) continue;

    const schedule = saleSchedule({
      total_amount: Number(raw.total_amount),
      amount_paid: Number(raw.amount_paid),
      installment_amount: Number(raw.installment_amount),
      installments_count: raw.installments_count,
      first_charge_date: raw.first_charge_date,
    });

    if (schedule.state === "SALDADO") continue;

    const row: CobranzaSaleRow = {
      id: raw.id,
      description: raw.item_description,
      category: raw.category,
      dueNow: schedule.dueNow,
      remaining: schedule.remaining,
      behind: schedule.behind,
      state: schedule.state,
      installmentLabel: `Cuota ${Math.min(schedule.due, raw.installments_count) || 1} de ${raw.installments_count}`,
      startsLabel:
        schedule.state === "POR_EMPEZAR"
          ? quincenaLabel(schedule.firstQuincena)
          : null,
    };

    const entry = byClient.get(client.id);
    if (entry) {
      entry.sales.push(row);
      entry.dueNow += row.dueNow;
      entry.remaining += row.remaining;
      entry.behind = Math.max(entry.behind, row.behind);
    } else {
      byClient.set(client.id, {
        id: client.id,
        name: client.name,
        phone: client.phone,
        dueNow: row.dueNow,
        remaining: row.remaining,
        behind: row.behind,
        sales: [row],
      });
    }
  }

  const clients = Array.from(byClient.values()).map((c) => ({
    ...c,
    dueNow: Math.round((c.dueNow + Number.EPSILON) * 100) / 100,
    remaining: Math.round((c.remaining + Number.EPSILON) * 100) / 100,
  }));

  const atrasados = clients
    .filter((c) => c.behind > 0)
    .sort((a, b) => b.behind - a.behind || b.dueNow - a.dueNow);

  const tocaAhora = clients
    .filter((c) => c.behind === 0 && c.dueNow > 0)
    .sort((a, b) => b.dueNow - a.dueNow);

  const alDia = clients
    .filter((c) => c.behind === 0 && c.dueNow <= 0)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const totalPorCobrar =
    Math.round(
      (atrasados.reduce((s, c) => s + c.dueNow, 0) +
        tocaAhora.reduce((s, c) => s + c.dueNow, 0) +
        Number.EPSILON) *
        100
    ) / 100;

  const porCobrarCount = atrasados.length + tocaAhora.length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Cobranza
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {quincenaLongLabel(current)}
        </p>
      </div>

      <Card className="border-indigo-200 bg-indigo-50/70 dark:border-indigo-900 dark:bg-indigo-950/30">
        <CardContent className="p-5">
          {porCobrarCount === 0 ? (
            <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              Nadie tiene cuota pendiente en esta quincena. Todo al día.
            </p>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
                Te toca cobrar
              </p>
              <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">
                {formatCurrency(totalPorCobrar)}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {porCobrarCount} cliente{porCobrarCount === 1 ? "" : "s"}
                {atrasados.length > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {atrasados.length} atrasado
                      {atrasados.length === 1 ? "" : "s"}
                    </span>
                  </>
                )}
              </p>
            </>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-indigo-600/80 dark:text-indigo-400/80">
            <CalendarClock className="h-3.5 w-3.5" />
            Próximo cobro: {quincenaLabel(next)}
            {diasParaLaProxima > 0
              ? ` · en ${diasParaLaProxima} día${diasParaLaProxima === 1 ? "" : "s"}`
              : " · hoy"}
          </p>
        </CardContent>
      </Card>

      <CobranzaList
        atrasados={atrasados}
        tocaAhora={tocaAhora}
        alDia={alDia}
        businessName={profile?.business_name ?? null}
        quincenaLabel={quincenaLabel(current)}
      />
    </div>
  );
}
