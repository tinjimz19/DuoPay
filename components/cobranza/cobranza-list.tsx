"use client";

import {
  CheckCircle2,
  ChevronDown,
  HandCoins,
  MessageCircle,
  Users,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import {
  CobrarDialog,
  type CobrarRow,
} from "@/components/cobranza/cobrar-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { CobranzaState } from "@/lib/quincenas";
import {
  buildQuincenaReminderMessage,
  whatsappReminderUrl,
} from "@/lib/reminders";
import { cn } from "@/lib/utils";
import type { ProductCategory } from "@/types/database.types";

export interface CobranzaSaleRow {
  id: string;
  description: string;
  category: ProductCategory;
  dueNow: number;
  /** Cuota que se le puede cobrar por adelantado cuando no le toca nada. */
  advanceAmount: number;
  remaining: number;
  behind: number;
  state: CobranzaState;
  installmentLabel: string;
  startsLabel: string | null;
}

export interface CobranzaClient {
  id: string;
  name: string;
  phone: string;
  dueNow: number;
  advanceNow: number;
  remaining: number;
  behind: number;
  sales: CobranzaSaleRow[];
}

function atrasoLabel(behind: number) {
  return `Atrasado ${behind} quincena${behind === 1 ? "" : "s"}`;
}

function ClientCard({
  client,
  businessName,
  quincenaLabel,
  tone,
  paymentBlock,
}: {
  client: CobranzaClient;
  businessName: string | null;
  quincenaLabel: string;
  tone: "atrasado" | "toca" | "aldia";
  paymentBlock?: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const [dialog, setDialog] = React.useState<{
    rows: CobrarRow[];
    kind: "COBRO" | "ADELANTO";
  } | null>(null);

  const cobrables = client.sales.filter((s) => s.dueNow > 0);
  const adelantables = client.sales.filter((s) => s.advanceAmount > 0);

  function abrirCobro(sales: CobranzaSaleRow[], kind: "COBRO" | "ADELANTO") {
    setDialog({
      kind,
      rows: sales.map((s) => ({
        saleId: s.id,
        description: s.description,
        suggested: kind === "ADELANTO" ? s.advanceAmount : s.dueNow,
        remaining: s.remaining,
      })),
    });
  }

  const waUrl =
    cobrables.length > 0
      ? whatsappReminderUrl(
          client.phone,
          buildQuincenaReminderMessage({
            businessName,
            clientName: client.name,
            quincenaLabel,
            paymentBlock,
            items: cobrables.map((s) => ({
              description: s.description,
              amount: s.dueNow,
            })),
            behind: client.behind,
          })
        )
      : null;

  return (
    <Card
      className={cn(
        "border bg-white dark:bg-slate-900",
        tone === "atrasado"
          ? "border-red-200 dark:border-red-900"
          : "border-slate-200 dark:border-slate-800"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/clientes/${client.id}`}
              className="truncate font-semibold text-slate-900 hover:underline dark:text-slate-100"
            >
              {client.name}
            </Link>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {client.behind > 0 ? (
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {atrasoLabel(client.behind)}
                </span>
              ) : tone === "aldia" ? (
                adelantables.length > 0
                  ? "Al día · puede adelantar"
                  : "Al día · nada que poner ahora"
              ) : (
                `${client.sales.length} venta${client.sales.length === 1 ? "" : "s"} abierta${client.sales.length === 1 ? "" : "s"}`
              )}
              {" · saldo "}
              {formatCurrency(client.remaining)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className={cn(
                "text-lg font-bold",
                client.dueNow > 0
                  ? tone === "atrasado"
                    ? "text-red-600 dark:text-red-400"
                    : "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              )}
            >
              {client.dueNow > 0 ? formatCurrency(client.dueNow) : "—"}
            </p>
          </div>
        </div>

        {cobrables.length === 0 && adelantables.length > 0 && (
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full text-sm"
              onClick={() => abrirCobro(adelantables, "ADELANTO")}
            >
              {adelantables.length === 1
                ? `Adelantar ${formatCurrency(adelantables[0].advanceAmount)}…`
                : "Adelantar…"}
            </Button>
          </div>
        )}

        {cobrables.length > 0 && (
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              className="h-11 flex-1 text-sm"
              onClick={() => abrirCobro(cobrables, "COBRO")}
            >
              <HandCoins className="h-4 w-4" />
              Cobrar {formatCurrency(client.dueNow)}…
            </Button>
            {waUrl && (
              <Button
                asChild
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400"
              >
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Avisar a ${client.name} por WhatsApp`}
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        )}

        {client.sales.length > 0 && (
          <>
            <button
              type="button"
              className="mt-2 flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  open && "rotate-180"
                )}
              />
              {open ? "Ocultar" : "Ver"} el detalle ({client.sales.length})
            </button>

            {open && (
              <div className="mt-2 space-y-2">
                {client.sales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-700 dark:text-slate-300">
                        {sale.description}
                      </p>
                      <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                        {sale.startsLabel
                          ? `Empieza el ${sale.startsLabel}`
                          : sale.installmentLabel}
                        {sale.behind > 0 ? ` · ${atrasoLabel(sale.behind)}` : ""}
                      </p>
                    </div>
                    {sale.dueNow > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 shrink-0 text-xs"
                        onClick={() => abrirCobro([sale], "COBRO")}
                      >
                        {formatCurrency(sale.dueNow)}…
                      </Button>
                    ) : sale.advanceAmount > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 shrink-0 text-xs text-indigo-600 dark:text-indigo-400"
                        onClick={() => abrirCobro([sale], "ADELANTO")}
                      >
                        Adelantar {formatCurrency(sale.advanceAmount)}…
                      </Button>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                        {formatCurrency(sale.remaining)} restante
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      {dialog && (
        <CobrarDialog
          open
          onOpenChange={(v) => !v && setDialog(null)}
          clientName={client.name}
          rows={dialog.rows}
          kind={dialog.kind}
        />
      )}
    </Card>
  );
}

function Section({
  title,
  hint,
  clients,
  tone,
  businessName,
  quincenaLabel,
  collapsible,
  paymentBlock,
}: {
  title: string;
  hint?: string;
  clients: CobranzaClient[];
  tone: "atrasado" | "toca" | "aldia";
  businessName: string | null;
  quincenaLabel: string;
  collapsible?: boolean;
  paymentBlock?: string[];
}) {
  const [open, setOpen] = React.useState(!collapsible);

  if (clients.length === 0) return null;

  return (
    <section className="space-y-2">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => collapsible && setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!collapsible}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title} ({clients.length})
        </h2>
        {collapsible && (
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-400 transition-transform",
              open && "rotate-180"
            )}
          />
        )}
      </button>
      {hint && open && (
        <p className="-mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>
      )}
      {open &&
        clients.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            tone={tone}
            businessName={businessName}
            quincenaLabel={quincenaLabel}
            paymentBlock={paymentBlock}
          />
        ))}
    </section>
  );
}

export function CobranzaList({
  atrasados,
  tocaAhora,
  alDia,
  businessName,
  quincenaLabel,
  paymentBlock,
}: {
  atrasados: CobranzaClient[];
  tocaAhora: CobranzaClient[];
  alDia: CobranzaClient[];
  businessName: string | null;
  quincenaLabel: string;
  paymentBlock?: string[];
}) {
  const vacio =
    atrasados.length === 0 && tocaAhora.length === 0 && alDia.length === 0;

  if (vacio) {
    return (
      <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          <Users className="h-8 w-8 text-slate-300 dark:text-slate-600" />
          No hay ventas a crédito abiertas.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Section
        title="Atrasados"
        hint="Se saltaron una o más quincenas."
        clients={atrasados}
        tone="atrasado"
        businessName={businessName}
        quincenaLabel={quincenaLabel}
        paymentBlock={paymentBlock}
      />
      <Section
        title="Toca ahora"
        clients={tocaAhora}
        tone="toca"
        businessName={businessName}
        quincenaLabel={quincenaLabel}
        paymentBlock={paymentBlock}
      />
      {alDia.length > 0 && (
        <div>
          <Section
            title="Al día"
            clients={alDia}
            tone="aldia"
            businessName={businessName}
            quincenaLabel={quincenaLabel}
            paymentBlock={paymentBlock}
            collapsible
          />
          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {alDia.length} cliente{alDia.length === 1 ? "" : "s"} sin nada
            pendiente en esta quincena
          </p>
        </div>
      )}
    </div>
  );
}
