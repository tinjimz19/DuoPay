"use client";

import { ExternalLink, Loader2, Pencil, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { deletePreorder, updatePreorderStatus } from "@/actions/preorder-actions";
import { CategoryBadge } from "@/components/category-badge";
import { PreorderConvertDialog } from "@/components/preorders/preorder-convert-dialog";
import { PreorderFormDialog } from "@/components/preorders/preorder-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PREORDER_STATUS_OPTIONS, PREORDER_STATUS_STYLES } from "@/lib/labels";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PreorderStatus, ProductCategory } from "@/types/database.types";

export interface PreorderCardData {
  id: string;
  product_name: string;
  category: ProductCategory;
  client_id: string | null;
  client_name_raw: string | null;
  client_name: string | null;
  quantity: number | null;
  estimated_price: number | null;
  status: PreorderStatus;
  notes: string | null;
  created_at: string;
  image_path: string | null;
  /** Dirección firmada, armada en el servidor. Vence; no se guarda. */
  image_url: string | null;
  /** Lleno cuando este pedido ya se convirtió: entonces no se repite. */
  sale_id: string | null;
}

export function PreorderCard({
  preorder,
  clients,
}: {
  preorder: PreorderCardData;
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [convertOpen, setConvertOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const clientName =
    preorder.client_name || preorder.client_name_raw || "Cliente";

  // Un pedido cancelado no se vende, y uno ya convertido no se convierte otra
  // vez: el botón desaparece en vez de fallar al pulsarlo. La base también se
  // niega, pero un botón que no está explica mejor que un error.
  const yaEsVenta = Boolean(preorder.sale_id);
  const sePuedeConvertir = !yaEsVenta && preorder.status !== "CANCELLED";

  function handleStatus(status: PreorderStatus) {
    if (status === preorder.status) return;
    startTransition(async () => {
      const res = await updatePreorderStatus(preorder.id, status);
      if (res.success) {
        toast.success("Estado actualizado");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al actualizar");
      }
    });
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2500);
      return;
    }
    startTransition(async () => {
      const res = await deletePreorder(preorder.id);
      if (res.success) {
        toast.success("Pedido eliminado");
        setConfirmDelete(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al eliminar");
      }
    });
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {preorder.image_url && (
            <a
              href={preorder.image_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
              aria-label={`Ver la foto de ${preorder.product_name} en grande`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preorder.image_url}
                alt=""
                className="h-16 w-16 rounded-md border border-slate-200 object-cover dark:border-slate-800"
              />
            </a>
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <CategoryBadge category={preorder.category} />
            </div>
            <p className="font-medium leading-snug text-slate-900 dark:text-slate-100">
              {preorder.product_name}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {clientName} · Cantidad: {preorder.quantity ?? 1}
            </p>
            {preorder.estimated_price !== null &&
              preorder.estimated_price !== undefined && (
                <p className="mt-0.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Est. {formatCurrency(Number(preorder.estimated_price))}
                </p>
              )}
          </div>
        </div>

        {preorder.notes && (
          <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            {preorder.notes}
          </p>
        )}

        <div className="mt-3 grid grid-cols-4 gap-1">
          {PREORDER_STATUS_OPTIONS.map((option) => {
            const active = preorder.status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={pending}
                onClick={() => handleStatus(option.value)}
                className={cn(
                  "min-h-11 rounded-md border px-1 text-[11px] font-medium transition-colors",
                  active
                    ? cn(PREORDER_STATUS_STYLES[option.value])
                    : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {/*
          El enlace va a la ficha del cliente y no a la lista de ventas: la
          lista obliga a buscar entre todas y la ficha enseña justo sus
          compras. Al convertir, el pedido se queda con el cliente de la
          venta, así que siempre tiene a dónde ir.
        */}
        {yaEsVenta ? (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="mt-3 h-11 w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
          >
            <Link
              href={
                preorder.client_id ? `/clientes/${preorder.client_id}` : "/ventas"
              }
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ya es una venta · verla
            </Link>
          </Button>
        ) : (
          sePuedeConvertir && (
            <Button
              size="sm"
              className="mt-3 h-11 w-full"
              onClick={() => setConvertOpen(true)}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Convertir en venta
            </Button>
          )
        )}

        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 flex-1"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 flex-1",
              confirmDelete &&
                "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
            )}
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {confirmDelete ? "¿Confirmar?" : "Eliminar"}
          </Button>
        </div>
      </CardContent>

      <PreorderFormDialog
        preorder={preorder}
        clients={clients}
        open={editOpen}
        hideTrigger
        onOpenChange={setEditOpen}
      />

      {sePuedeConvertir && (
        <PreorderConvertDialog
          preorder={preorder}
          clients={clients}
          open={convertOpen}
          onOpenChange={setConvertOpen}
        />
      )}
    </Card>
  );
}