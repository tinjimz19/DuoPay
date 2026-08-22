"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import {
  purgeClient,
  restoreClient,
} from "@/actions/client-actions";
import {
  purgePayment,
  purgeSale,
  restorePayment,
  restoreSale,
} from "@/actions/sale-actions";
import {
  purgePreorder,
  restorePreorder,
} from "@/actions/preorder-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";

export interface TrashClientItem {
  id: string;
  name: string;
  phone: string;
  deleted_at: string | null;
}

export interface TrashSaleItem {
  id: string;
  item_description: string;
  client_name: string;
  total_amount: number;
  deleted_at: string | null;
}

export interface TrashPaymentItem {
  id: string;
  amount: number;
  payment_number: number | null;
  sale_description: string;
  deleted_at: string | null;
}

export interface TrashPreorderItem {
  id: string;
  product_name: string;
  deleted_at: string | null;
}

type Action = (id: string) => Promise<{ success: boolean; error?: string }>;

function useTrashAction() {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function run(id: string, action: Action, message: string) {
    setPendingId(id);
    startTransition(async () => {
      const res = await action(id);
      if (res.success) {
        toast.success(message);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error en la operación");
      }
      setPendingId(null);
    });
  }

  return { run, pendingId, pending };
}

function TrashButton({
  label,
  onRestore,
  onPurge,
  pending,
}: {
  label: string;
  onRestore: () => void;
  onPurge: () => void;
  pending: boolean;
}) {
  const [confirming, setConfirming] = React.useState(false);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-9 text-xs"
        disabled={pending}
        onClick={onRestore}
      >
        <RotateCcw />
        Restaurar
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-9 text-xs text-destructive hover:text-destructive"
        disabled={pending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            setTimeout(() => setConfirming(false), 2500);
            return;
          }
          setConfirming(false);
          onPurge();
        }}
      >
        <Trash2 />
        {confirming ? "¿Confirmar?" : label}
      </Button>
    </div>
  );
}

export function TrashList({
  clients,
  sales,
  payments,
  preorders,
}: {
  clients: TrashClientItem[];
  sales: TrashSaleItem[];
  payments: TrashPaymentItem[];
  preorders: TrashPreorderItem[];
}) {
  const clientAction = useTrashAction();
  const saleAction = useTrashAction();
  const paymentAction = useTrashAction();
  const preorderAction = useTrashAction();

  const empty =
    clients.length === 0 &&
    sales.length === 0 &&
    payments.length === 0 &&
    preorders.length === 0;

  if (empty) {
    return (
      <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          <Trash2 className="h-8 w-8 text-slate-300 dark:text-slate-600" />
          La papelera está vacía.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {clients.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Clientes ({clients.length})
          </h2>
          {clients.map((client) => (
            <Card
              key={client.id}
              className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                    {client.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {client.deleted_at
                      ? `Eliminado el ${formatDate(client.deleted_at)}`
                      : "Eliminado"}
                  </p>
                </div>
                <TrashButton
                  label="Eliminar"
                  pending={clientAction.pending && clientAction.pendingId === client.id}
                  onRestore={() =>
                    clientAction.run(client.id, restoreClient, "Cliente restaurado")
                  }
                  onPurge={() =>
                    clientAction.run(
                      client.id,
                      purgeClient,
                      "Cliente eliminado definitivamente"
                    )
                  }
                />
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {sales.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Ventas ({sales.length})
          </h2>
          {sales.map((sale) => (
            <Card
              key={sale.id}
              className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                    {sale.item_description}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {sale.client_name} · {formatCurrency(Number(sale.total_amount))}{" "}
                    ·{" "}
                    {sale.deleted_at
                      ? `Eliminada el ${formatDate(sale.deleted_at)}`
                      : "Eliminada"}
                  </p>
                </div>
                <TrashButton
                  label="Eliminar"
                  pending={saleAction.pending && saleAction.pendingId === sale.id}
                  onRestore={() =>
                    saleAction.run(sale.id, restoreSale, "Venta restaurada")
                  }
                  onPurge={() =>
                    saleAction.run(
                      sale.id,
                      purgeSale,
                      "Venta eliminada definitivamente"
                    )
                  }
                />
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {payments.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Abonos ({payments.length})
          </h2>
          {payments.map((payment) => (
            <Card
              key={payment.id}
              className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                    {payment.payment_number
                      ? `Abono ${payment.payment_number}`
                      : "Abono"}{" "}
                    · {formatCurrency(payment.amount)}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {payment.sale_description}
                    {payment.deleted_at
                      ? ` · Eliminado el ${formatDate(payment.deleted_at)}`
                      : ""}
                  </p>
                </div>
                <TrashButton
                  label="Eliminar"
                  pending={
                    paymentAction.pending &&
                    paymentAction.pendingId === payment.id
                  }
                  onRestore={() =>
                    paymentAction.run(
                      payment.id,
                      restorePayment,
                      "Abono restaurado"
                    )
                  }
                  onPurge={() =>
                    paymentAction.run(
                      payment.id,
                      purgePayment,
                      "Abono eliminado definitivamente"
                    )
                  }
                />
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {preorders.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Pedidos ({preorders.length})
          </h2>
          {preorders.map((preorder) => (
            <Card
              key={preorder.id}
              className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                    {preorder.product_name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {preorder.deleted_at
                      ? `Eliminado el ${formatDate(preorder.deleted_at)}`
                      : "Eliminado"}
                  </p>
                </div>
                <TrashButton
                  label="Eliminar"
                  pending={
                    preorderAction.pending &&
                    preorderAction.pendingId === preorder.id
                  }
                  onRestore={() =>
                    preorderAction.run(
                      preorder.id,
                      restorePreorder,
                      "Pedido restaurado"
                    )
                  }
                  onPurge={() =>
                    preorderAction.run(
                      preorder.id,
                      purgePreorder,
                      "Pedido eliminado definitivamente"
                    )
                  }
                />
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
