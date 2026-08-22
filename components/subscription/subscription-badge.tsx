"use client";

import * as React from "react";

import { ReportPaymentDialog } from "@/components/subscription/report-payment-dialog";
import { cn } from "@/lib/utils";

export type SubscriptionTone = "ok" | "pronto" | "urgente";

const TONE_STYLES: Record<SubscriptionTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  pronto:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  urgente:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
};

/**
 * Estado de la suscripción, junto al nombre del negocio.
 *
 * Cuando queda poco, la insignia es además el botón para reportar el pago:
 * el aviso y la acción en el mismo sitio, sin un botón flotante tapando la
 * pantalla.
 */
export function SubscriptionBadge({
  label,
  tone,
}: {
  label: string;
  tone: SubscriptionTone;
}) {
  const base = cn(
    "shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight",
    TONE_STYLES[tone]
  );

  if (tone === "ok") {
    return <span className={base}>{label}</span>;
  }

  return (
    <ReportPaymentDialog
      triggerLabel={label}
      triggerVariant="ghost"
      triggerClassName={cn(base, "h-auto hover:opacity-80")}
      showTriggerIcon={false}
    />
  );
}
