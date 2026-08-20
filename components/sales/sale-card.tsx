"use client";

import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { deleteSale, recordPayment } from "@/actions/sale-actions";
import { CategoryBadge } from "@/components/category-badge";
import { SaleStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/format";
import type { ProductCategory, SaleStatus } from "@/types/database.types";

export interface PaymentRecord {
  id: string;
  amount: number;
  payment_number: number | null;
  notes: string | null;
  created_at: string;
}

export interface SaleCardData {
  id: string;
  item_description: string;
  category: ProductCategory;
  total_amount: number;
  amount_paid: number;
  installment_amount: number;
  installments_count: number;
  status: SaleStatus;
  notes: string | null;
  created_at: string;
  client_name: string;
  payments?: PaymentRecord[];
}

export function SaleCard({ sale }: { sale: SaleCardData }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [customAmount, setCustomAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const paid = Number(sale.amount_paid);
  const total = Number(sale.total_amount);
  const remaining = Math.max(0, total - paid);
  const percent = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const paymentCount = sale.payments?.length ?? 0;
  const nextNumber = paymentCount + 1;
  const suggested = Math.min(Number(sale.installment_amount), remaining);

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 2500);
      return;
    }
    startTransition(async () => {
      const res = await deleteSale(sale.id);
      if (res.success) {
        toast.success("Venta eliminada");
        setConfirmingDelete(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al eliminar");
      }
    });
  }

  function handlePay(amount: number) {
    if (amount <= 0 || amount > remaining) {
      toast.error("Monto inválido");
      return;
    }
    startTransition(async () => {
      const res = await recordPayment({
        saleId: sale.id,
        amount,
        paymentNumber: nextNumber,
        notes: notes.trim() || null,
      });
      if (res.success) {
        toast.success("Abono registrado");
        setCustomAmount("");
        setNotes("");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al registrar el abono");
      }
    });
  }

  const parsedCustom = parseFloat(customAmount.replace(",", "."));

  return (
    <div className="relative">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1">
                  <CategoryBadge category={sale.category} />
                </div>
                <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                  {sale.item_description}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {sale.client_name}
                </p>
              </div>
              <SaleStatusBadge status={sale.status} />
            </div>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">
                  {formatCurrency(paid)} de {formatCurrency(total)}
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatCurrency(remaining)}
                </span>
              </div>
              <Progress
                value={percent}
                className="h-2 bg-slate-200 dark:bg-slate-800"
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {sale.installments_count} cuota
                {sale.installments_count > 1 ? "s" : ""} ·{" "}
                {formatCurrency(Number(sale.installment_amount))} c/u
              </p>
            </div>
          </button>
        </DialogTrigger>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar abono</DialogTitle>
            <DialogDescription>
              {sale.item_description} · {sale.client_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Total</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {formatCurrency(total)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Abonado</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {formatCurrency(paid)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Por cobrar</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {formatCurrency(remaining)}
              </span>
            </div>
            <Progress
              value={percent}
              className="h-2 bg-slate-200 dark:bg-slate-800"
            />
          </div>

          {sale.status === "COMPLETED" ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              Esta venta ya está saldada.
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                type="button"
                className="h-12 w-full text-sm"
                disabled={pending || remaining <= 0}
                onClick={() => handlePay(suggested)}
              >
                {pending && <Loader2 className="animate-spin" />}
                Abonar cuota {nextNumber} · {formatCurrency(suggested)}
              </Button>

              <div className="space-y-2">
                <Label htmlFor="custom-amount">Monto personalizado</Label>
                <div className="flex gap-2">
                  <Input
                    id="custom-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="h-11"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0"
                    disabled={
                      pending ||
                      !Number.isFinite(parsedCustom) ||
                      parsedCustom <= 0
                    }
                    onClick={() => handlePay(parsedCustom)}
                  >
                    Abonar
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-notes">
                  Nota <span className="text-slate-400">(opcional)</span>
                </Label>
                <Input
                  id="payment-notes"
                  placeholder="Ej: abonó efectivo"
                  className="h-11"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="absolute right-3 top-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full bg-white/80 text-slate-500 hover:text-destructive dark:bg-slate-900/80 dark:text-slate-400"
              aria-label="Opciones de venta"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              <Trash2 className="h-4 w-4" />
              {confirmingDelete ? "¿Confirmar eliminación?" : "Eliminar venta"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}