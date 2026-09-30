"use client";

import { ImageOff, Loader2, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { deleteCatalogProduct } from "@/actions/catalog-actions";
import { CategoryBadge } from "@/components/category-badge";
import { CatalogFormDialog } from "@/components/catalog/catalog-form-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import type { ProductCategory } from "@/types/database.types";

export interface CatalogItem {
  id: string;
  name: string;
  category: ProductCategory;
  price: number | null;
  note: string | null;
  /** Ruta dentro del depósito, para reemplazar/borrar la imagen. */
  image_path: string | null;
  /** Dirección firmada, armada en el servidor. Vence; no se guarda. */
  image_url: string | null;
}

export function CatalogCard({ item }: { item: CatalogItem }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteCatalogProduct(item.id);
      if (res.success) {
        toast.success("Producto eliminado");
        setConfirmOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="aspect-square w-full bg-slate-50 dark:bg-slate-800/60">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
      </div>

      <div className="space-y-1 p-3">
        <div className="flex items-center gap-2">
          <CategoryBadge
            category={item.category}
            className="shrink-0 px-1.5 py-0 text-[10px] font-semibold"
          />
        </div>
        <p className="truncate font-medium leading-snug text-slate-900 dark:text-slate-100">
          {item.name}
        </p>
        {item.price !== null && (
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            {formatCurrency(item.price)}
          </p>
        )}
        {item.note && (
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {item.note}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
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
            className="h-9 w-9 shrink-0 p-0 text-slate-400 hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={pending}
            aria-label={`Eliminar ${item.name}`}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      <CatalogFormDialog
        product={item}
        open={editOpen}
        hideTrigger
        onOpenChange={setEditOpen}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Eliminar del catálogo?"
        description={
          <>
            Se quita <span className="font-medium">{item.name}</span> del
            catálogo, junto con su imagen. Esto no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar"
        pending={pending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
