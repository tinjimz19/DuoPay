"use client";

import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import {
  confirmPaymentReport,
  rejectPaymentReport,
} from "@/actions/payment-report-actions";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { PaymentReportStatus } from "@/types/database.types";

export interface PaymentReportCardData {
  id: string;
  amount: number | null;
  method: string;
  reference: string | null;
  proof_path: string | null;
  notes: string | null;
  status: PaymentReportStatus;
  created_at: string;
  reviewed_at: string | null;
  store_name: string;
  proofUrl: string | null;
}

const STATUS_STYLES: Record<PaymentReportStatus, string> = {
  PENDING:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  CONFIRMED:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  REJECTED:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
};

const STATUS_LABELS: Record<PaymentReportStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  REJECTED: "Rechazado",
};

export function PaymentReportCard({ report }: { report: PaymentReportCardData }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function run(
    action: (input: { reportId: string }) => Promise<{ success: boolean; error?: string }>,
    message: string
  ) {
    startTransition(async () => {
      const res = await action({ reportId: report.id });
      if (res.success) {
        toast.success(message);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error en la operación");
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900 dark:text-slate-100">
            {report.store_name}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {report.method}
            {report.amount ? ` · ${formatCurrency(Number(report.amount))}` : ""}
            {report.reference ? ` · Ref: ${report.reference}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {formatDateTime(report.created_at)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[report.status]}`}
        >
          {STATUS_LABELS[report.status]}
        </span>
      </div>

      {report.notes && (
        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          {report.notes}
        </p>
      )}

      {report.proofUrl && (
        <a
          href={report.proofUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={report.proofUrl}
            alt={`Captura de pago de ${report.store_name}`}
            className="max-h-64 w-full object-contain"
          />
        </a>
      )}

      {report.status === "PENDING" && (
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            className="h-9 flex-1 text-xs"
            disabled={pending}
            onClick={() => run(confirmPaymentReport, "Pago confirmado · tienda activada 30 días")}
          >
            {pending && <Loader2 className="animate-spin" />}
            <Check />
            Confirmar y activar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 flex-1 text-xs"
            disabled={pending}
            onClick={() => run(rejectPaymentReport, "Reporte rechazado")}
          >
            <X />
            Rechazar
          </Button>
        </div>
      )}
    </div>
  );
}
