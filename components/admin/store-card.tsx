"use client";

import {
  CalendarClock,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  TimerOff,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import {
  activateStore,
  markStoreExpired,
  reactivateTrial,
  suspendStore,
} from "@/actions/admin-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/format";
import { daysLeft, getEffectiveStatus } from "@/lib/subscription";
import { PROFILE_STATUS_LABELS, PROFILE_STATUS_STYLES } from "@/lib/labels";
import type { StoreWithStats } from "@/lib/admin-data";

export function StoreCard({ store }: { store: StoreWithStats }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [confirmingSuspend, setConfirmingSuspend] = React.useState(false);

  const effective = getEffectiveStatus(store);
  const isActive = effective === "ACTIVE";
  const remainingDays =
    effective === "TRIAL"
      ? daysLeft(store.trial_ends_at)
      : isActive
        ? daysLeft(store.subscription_ends_at)
        : null;

  function runAction(
    action: (input: { profileId: string }) => Promise<{ success: boolean; error?: string }>,
    successMessage: string
  ) {
    startTransition(async () => {
      const res = await action({ profileId: store.id });
      if (res.success) {
        toast.success(successMessage);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error en la operación");
      }
    });
  }

  function handleSuspend() {
    if (!confirmingSuspend) {
      setConfirmingSuspend(true);
      setTimeout(() => setConfirmingSuspend(false), 2500);
      return;
    }
    setConfirmingSuspend(false);
    runAction(suspendStore, "Tienda suspendida");
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900 dark:text-slate-100">
            {store.business_name || store.full_name || "Sin nombre"}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {store.full_name}
            {store.email ? ` · ${store.email}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${PROFILE_STATUS_STYLES[effective]}`}
        >
          {PROFILE_STATUS_LABELS[effective]}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {store.clients_count}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">clientes</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {store.sales_count}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">ventas</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {formatCurrency(store.outstanding)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">por cobrar</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <CalendarClock className="h-3.5 w-3.5" />
        {effective === "TRIAL" && store.trial_ends_at && (
          <span>
            Prueba hasta {formatDate(store.trial_ends_at)}
            {remainingDays !== null && ` (${remainingDays}d)`}
          </span>
        )}
        {isActive && store.subscription_ends_at && (
          <span>
            Activa hasta {formatDate(store.subscription_ends_at)}
            {remainingDays !== null && ` (${remainingDays}d)`}
          </span>
        )}
        {(effective === "EXPIRED" || effective === "SUSPENDED") && (
          <span>Registrada el {formatDate(store.created_at)}</span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          size="sm"
          className="h-9 flex-1 text-xs"
          disabled={pending}
          onClick={() =>
            runAction(
              activateStore,
              isActive ? "Suscripción renovada +30 días" : "Tienda activada 30 días"
            )
          }
        >
          {pending && <Loader2 className="animate-spin" />}
          {isActive ? "Renovar +30 días" : "Activar 30 días · $10"}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={pending}
              aria-label="Opciones de tienda"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => runAction(reactivateTrial, "Prueba reactivada por 3 días")}
            >
              <RotateCcw className="h-4 w-4" />
              Reactivar prueba (3 días)
            </DropdownMenuItem>
            {!isActive && effective !== "SUSPENDED" && (
              <DropdownMenuItem
                onClick={() => runAction(markStoreExpired, "Tienda marcada como vencida")}
              >
                <TimerOff className="h-4 w-4" />
                Marcar como vencida
              </DropdownMenuItem>
            )}
            {effective !== "SUSPENDED" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleSuspend}
                >
                  <XCircle className="h-4 w-4" />
                  {confirmingSuspend ? "¿Confirmar suspensión?" : "Suspender tienda"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
