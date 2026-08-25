"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { recordPaymentsBatch } from "@/actions/sale-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { formatCurrency } from "@/lib/format";
import { moneyInputValue, parseMoney } from "@/lib/money";

export interface CobrarRow {
  saleId: string;
  description: string;
  /** Lo que la app propone: la cuota de la quincena, o una si es adelanto. */
  suggested: number;
  /** Tope: nunca se puede abonar más que el saldo de la venta. */
  remaining: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Confirmación de cobro con los montos editables.
 *
 * La app propone la cuota, pero el cliente casi nunca trae la cifra exacta:
 * trae lo que trae. Cobrar de un toque sin poder ajustar obligaba a abonar
 * la cuota completa o nada.
 */
export function CobrarDialog({
  open,
  onOpenChange,
  clientName,
  rows,
  kind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  rows: CobrarRow[];
  kind: "COBRO" | "ADELANTO";
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState("");

  // Cada vez que se abre, vuelve a proponer los montos frescos.
  React.useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const row of rows) next[row.saleId] = moneyInputValue(row.suggested);
    setAmounts(next);
    setNotes("");
  }, [open, rows]);

  const parsed = rows.map((row) => {
    const raw = amounts[row.saleId] ?? "";
    const value = parseMoney(raw);
    const valid = Number.isFinite(value) && value > 0;
    return {
      row,
      raw,
      value: valid ? round2(value) : 0,
      excede: valid && round2(value) > row.remaining,
    };
  });

  const total = round2(parsed.reduce((sum, p) => sum + p.value, 0));
  const hayExcedidos = parsed.some((p) => p.excede);
  const puedeCobrar = total > 0 && !hayExcedidos && !pending;

  function confirmar() {
    const items = parsed
      .filter((p) => p.value > 0)
      .map((p) => ({ saleId: p.row.saleId, amount: p.value }));

    if (items.length === 0) {
      toast.error("Pon al menos un monto");
      return;
    }

    startTransition(async () => {
      const res = await recordPaymentsBatch({
        items,
        kind,
        notes: notes.trim() || null,
      });

      if (res.success) {
        toast.success(
          `${kind === "ADELANTO" ? "Adelanto" : "Cobro"} de ${formatCurrency(res.amount)} a ${clientName}`
        );
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const uno = rows.length === 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {kind === "ADELANTO" ? "Adelantar" : "Cobrar"} a {clientName}
          </DialogTitle>
          <DialogDescription>
            {uno
              ? "Ajusta el monto si trae menos."
              : "Ajusta lo que abona en cada venta. Déjalo en 0 para saltar una."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {parsed.map(({ row, raw, excede }) => (
            <div key={row.saleId} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label
                  htmlFor={`monto-${row.saleId}`}
                  className="min-w-0 flex-1 truncate text-sm font-normal"
                >
                  {row.description}
                </Label>
                <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                  saldo {formatCurrency(row.remaining)}
                </span>
              </div>
              <div className="flex gap-2">
                <MoneyInput
                  id={`monto-${row.saleId}`}
                  className="h-11"
                  value={raw}
                  onChange={(next) =>
                    setAmounts((prev) => ({ ...prev, [row.saleId]: next }))
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0 text-xs"
                  disabled={pending}
                  onClick={() =>
                    setAmounts((prev) => ({
                      ...prev,
                      [row.saleId]: moneyInputValue(row.remaining),
                    }))
                  }
                >
                  Todo
                </Button>
              </div>
              {excede && (
                <p className="text-xs font-medium text-destructive">
                  Máximo {formatCurrency(row.remaining)}
                </p>
              )}
            </div>
          ))}

          <div className="space-y-1.5 pt-1">
            <Label htmlFor="cobro-nota" className="text-sm font-normal">
              Nota <span className="text-slate-400">(opcional)</span>
            </Label>
            <Input
              id="cobro-nota"
              placeholder="Ej: pagó en efectivo"
              className="h-11"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {!uno && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Total</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {formatCurrency(total)}
              </span>
            </div>
          )}

          <Button
            type="button"
            className="h-12 w-full text-sm"
            disabled={!puedeCobrar}
            onClick={confirmar}
          >
            {pending && <Loader2 className="animate-spin" />}
            Registrar {formatCurrency(total)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
