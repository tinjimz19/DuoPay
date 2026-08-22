"use client";

import {
  Check,
  HandCoins,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import {
  deletePayment,
  deleteSale,
  recordPayment,
  updatePayment,
} from "@/actions/sale-actions";
import { getEuroRate } from "@/actions/rates";
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
import { formatBs, formatCurrency, formatDateTime } from "@/lib/format";
import {
  buildDebtReminderMessage,
  whatsappReminderUrl,
} from "@/lib/reminders";
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
  client_phone?: string | null;
  payments?: PaymentRecord[];
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(",", "."));
}

/**
 * Una fila del historial de abonos, editable en sitio.
 * Corregir un monto mal tecleado no debería obligar a borrar la venta.
 */
function PaymentRow({
  payment,
  disabled,
  onChanged,
}: {
  payment: PaymentRecord;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(String(payment.amount));
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const parsed = parseAmount(draft);
  const busy = pending || disabled;

  function save() {
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Monto inválido");
      return;
    }
    startTransition(async () => {
      const res = await updatePayment({
        id: payment.id,
        amount: parsed,
        notes: payment.notes,
      });
      if (res.success) {
        toast.success("Abono corregido");
        setEditing(false);
        onChanged();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 2500);
      return;
    }
    setConfirmingDelete(false);
    startTransition(async () => {
      const res = await deletePayment(payment.id);
      if (res.success) {
        toast.success("Abono eliminado · está en la papelera");
        onChanged();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2 dark:border-indigo-900 dark:bg-indigo-950/30">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          autoFocus
          className="h-9 flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Nuevo monto del abono"
        />
        <Button
          type="button"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={busy}
          onClick={save}
          aria-label="Guardar monto"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          disabled={busy}
          onClick={() => {
            setDraft(String(payment.amount));
            setEditing(false);
          }}
          aria-label="Cancelar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-700 dark:text-slate-300">
          {payment.payment_number ? `Cuota ${payment.payment_number}` : "Abono"}
          {payment.notes ? ` · ${payment.notes}` : ""}
        </p>
        <p className="truncate text-xs text-slate-400 dark:text-slate-500">
          {formatDateTime(payment.created_at)}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
        {formatCurrency(Number(payment.amount))}
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0 text-slate-400"
        disabled={busy}
        onClick={() => setEditing(true)}
        aria-label="Corregir abono"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={
          confirmingDelete
            ? "h-8 w-8 shrink-0 text-destructive"
            : "h-8 w-8 shrink-0 text-slate-400 hover:text-destructive"
        }
        disabled={busy}
        onClick={remove}
        aria-label={confirmingDelete ? "Confirmar borrado" : "Eliminar abono"}
        title={confirmingDelete ? "Toca otra vez para confirmar" : "Eliminar"}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}

export function SaleCard({
  sale,
  businessName,
}: {
  sale: SaleCardData;
  businessName?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [customAmount, setCustomAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [euroRate, setEuroRate] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    getEuroRate()
      .then((r) => {
        if (active) setEuroRate(r.rate);
      })
      .catch(() => {
        if (active) setEuroRate(null);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const paid = Number(sale.amount_paid);
  const total = Number(sale.total_amount);
  const remaining = Math.max(0, total - paid);
  const percent = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const payments = sale.payments ?? [];

  // Siguiente cuota = la mayor registrada + 1. Contar filas repetiría un
  // número si se borró un abono intermedio.
  const nextNumber =
    payments.reduce((max, p) => Math.max(max, p.payment_number ?? 0), 0) + 1;
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
        toast.error(res.error);
      }
    });
  }

  function handlePay(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Monto inválido");
      return;
    }
    startTransition(async () => {
      const res = await recordPayment({
        saleId: sale.id,
        amount,
        notes: notes.trim() || null,
      });
      if (res.success) {
        toast.success(
          res.clamped
            ? `Se registró ${formatCurrency(res.amount)}: era todo lo que faltaba`
            : "Abono registrado"
        );
        setCustomAmount("");
        setNotes("");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const parsedCustom = parseAmount(customAmount);

  const suggestedBs = euroRate ? suggested * euroRate : null;
  const customBs =
    euroRate && Number.isFinite(parsedCustom) && parsedCustom > 0
      ? parsedCustom * euroRate
      : null;

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

        <DialogContent className="max-h-[85vh] overflow-y-auto">
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

          {remaining <= 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              Esta venta ya está saldada.
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                type="button"
                className="h-12 w-full text-sm"
                disabled={pending}
                onClick={() => handlePay(suggested)}
              >
                {pending && <Loader2 className="animate-spin" />}
                Abonar cuota {nextNumber} · {formatCurrency(suggested)}
              </Button>
              {suggestedBs != null && (
                <p className="-mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
                  ≈ {formatBs(suggestedBs)}
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor={`custom-amount-${sale.id}`}>
                  Monto personalizado
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`custom-amount-${sale.id}`}
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
                {customBs != null && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    ≈ {formatBs(customBs)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`payment-notes-${sale.id}`}>
                  Nota <span className="text-slate-400">(opcional)</span>
                </Label>
                <Input
                  id={`payment-notes-${sale.id}`}
                  placeholder="Ej: abonó efectivo"
                  className="h-11"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          {payments.length > 0 && (
            <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Abonos registrados ({payments.length})
              </p>
              {payments.map((payment) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  disabled={pending}
                  onChanged={() => router.refresh()}
                />
              ))}
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
            {sale.client_phone && remaining > 0 && (
              <DropdownMenuItem asChild>
                <a
                  href={whatsappReminderUrl(
                    sale.client_phone,
                    buildDebtReminderMessage({
                      businessName,
                      clientName: sale.client_name,
                      items: [
                        {
                          description: sale.item_description,
                          remaining,
                        },
                      ],
                    })
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <HandCoins className="h-4 w-4" />
                  Recordar por WhatsApp
                </a>
              </DropdownMenuItem>
            )}
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
