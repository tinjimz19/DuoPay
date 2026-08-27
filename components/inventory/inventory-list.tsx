"use client";

import { Loader2, Minus, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import {
  addStock,
  deleteProduct,
  removeStock,
  setStock,
} from "@/actions/product-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCategories } from "@/components/categories-provider";
import { cn } from "@/lib/utils";
import type { ProductCategory } from "@/types/database.types";

export interface InventoryProduct {
  id: string;
  name: string;
  category: ProductCategory;
  stock: number;
}

/** Diálogo para mover varias unidades de golpe o dejar el stock en un número. */
function MoveStockDialog({
  product,
  mode,
  onOpenChange,
}: {
  product: InventoryProduct;
  mode: "ENTRADA" | "SALIDA" | "AJUSTE" | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [value, setValue] = React.useState("1");

  React.useEffect(() => {
    if (!mode) return;
    setValue(mode === "AJUSTE" ? String(product.stock) : "1");
  }, [mode, product.stock]);

  if (!mode) return null;

  const cantidad = Number(value);
  const valido =
    Number.isInteger(cantidad) &&
    (mode === "AJUSTE" ? cantidad >= 0 : cantidad > 0);

  const titulos = {
    ENTRADA: "Agregar unidades",
    SALIDA: "Sacar unidades",
    AJUSTE: "Corregir la cantidad",
  } as const;

  const descripciones = {
    ENTRADA: "Llegó mercancía nueva.",
    SALIDA: "Salió sin venderse: se dañó, la regalaste, uso personal.",
    AJUSTE: "Contaste y son otras. Deja el número exacto que hay.",
  } as const;

  function confirmar() {
    startTransition(async () => {
      const res =
        mode === "ENTRADA"
          ? await addStock({ productId: product.id, quantity: cantidad })
          : mode === "SALIDA"
            ? await removeStock({ productId: product.id, quantity: cantidad })
            : await setStock({ productId: product.id, target: cantidad });

      if (res.success) {
        toast.success(`${product.name}: quedan ${res.stock}`);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {titulos[mode]} · {product.name}
          </DialogTitle>
          <DialogDescription>
            {descripciones[mode]} Ahora tienes {product.stock}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mover-cantidad">
              {mode === "AJUSTE" ? "Cantidad real" : "Cuántas"}
            </Label>
            <Input
              id="mover-cantidad"
              type="number"
              inputMode="numeric"
              min={mode === "AJUSTE" ? 0 : 1}
              max={mode === "SALIDA" ? product.stock : undefined}
              step="1"
              autoFocus
              className="h-11"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {mode === "SALIDA" && cantidad > product.stock && (
              <p className="text-xs font-medium text-destructive">
                Solo tienes {product.stock}
              </p>
            )}
          </div>

          <Button
            type="button"
            className="h-12 w-full text-sm"
            disabled={
              pending ||
              !valido ||
              (mode === "SALIDA" && cantidad > product.stock)
            }
            onClick={confirmar}
          >
            {pending && <Loader2 className="animate-spin" />}
            {mode === "AJUSTE"
              ? `Dejar en ${valido ? cantidad : "…"}`
              : mode === "ENTRADA"
                ? `Agregar ${valido ? cantidad : "…"}`
                : `Sacar ${valido ? cantidad : "…"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductRow({ product }: { product: InventoryProduct }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [mode, setMode] = React.useState<
    "ENTRADA" | "SALIDA" | "AJUSTE" | null
  >(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const agotado = product.stock <= 0;

  /** Un toque = una unidad. Para varias, se mantiene pulsado el número. */
  function paso(delta: 1 | -1) {
    startTransition(async () => {
      const res =
        delta === 1
          ? await addStock({ productId: product.id, quantity: 1 })
          : await removeStock({ productId: product.id, quantity: 1 });

      if (res.success) {
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function borrar() {
    startTransition(async () => {
      const res = await deleteProduct(product.id);
      if (res.success) {
        toast.success("Producto eliminado · está en la papelera");
        setConfirmingDelete(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card
      className={cn(
        "border bg-white dark:bg-slate-900",
        agotado
          ? "border-red-200 dark:border-red-900"
          : "border-slate-200 dark:border-slate-800"
      )}
    >
      <CardContent className="flex items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900 dark:text-slate-100">
            {product.name}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {agotado ? (
              <span className="font-semibold text-red-600 dark:text-red-400">
                Sin stock
              </span>
            ) : (
              `${product.stock} disponible${product.stock === 1 ? "" : "s"}`
            )}
          </p>
        </div>

        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0"
          disabled={pending || agotado}
          onClick={() => paso(-1)}
          aria-label={`Sacar una unidad de ${product.name}`}
        >
          <Minus className="h-4 w-4" />
        </Button>

        <button
          type="button"
          className={cn(
            "h-9 min-w-[2.75rem] shrink-0 rounded-md border px-2 text-base font-bold tabular-nums transition-colors",
            agotado
              ? "border-red-200 text-red-600 dark:border-red-900 dark:text-red-400"
              : "border-slate-200 text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
          )}
          disabled={pending}
          onClick={() => setMode("AJUSTE")}
          aria-label={`Corregir la cantidad de ${product.name}`}
          title="Tocar para corregir la cantidad"
        >
          {pending ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          ) : (
            product.stock
          )}
        </button>

        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0"
          disabled={pending}
          onClick={() => paso(1)}
          aria-label={`Agregar una unidad de ${product.name}`}
        >
          <Plus className="h-4 w-4" />
        </Button>

        <ProductFormDialog product={product} />

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-slate-400 hover:text-destructive"
          disabled={pending}
          onClick={() => setConfirmingDelete(true)}
          aria-label={`Eliminar ${product.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CardContent>

      <MoveStockDialog
        product={product}
        mode={mode}
        onOpenChange={(v) => !v && setMode(null)}
      />

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="¿Eliminar este producto?"
        description={
          <>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {product.name}
            </span>{" "}
            sale del inventario con sus {Math.max(0, product.stock)} unidades.
            Va a la papelera y se puede restaurar. Las ventas que ya lo
            incluyeron no se tocan.
          </>
        }
        confirmLabel="Eliminar producto"
        pending={pending}
        onConfirm={borrar}
      />
    </Card>
  );
}

export function InventoryList({ products }: { products: InventoryProduct[] }) {
  const categorias = useCategories();
  const [query, setQuery] = React.useState("");

  const filtrados = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  // Se agrupa con las mismas categorías que ya usan las ventas.
  const porCategoria = React.useMemo(() => {
    return categorias.all.map((option) => ({
      category: option.slug,
      label: option.label,
      items: filtrados.filter((p) => p.category === option.slug),
    })).filter((group) => group.items.length > 0);
    // El catálogo entra en las dependencias: si el super admin agrega una
    // categoría, los grupos tienen que rearmarse.
  }, [filtrados, categorias.all]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="h-11 pl-9"
          placeholder="Buscar producto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtrados.length === 0 ? (
        <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No se encontraron productos.
          </CardContent>
        </Card>
      ) : (
        porCategoria.map((group) => (
          <section key={group.category} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {group.label} ({group.items.length})
            </h2>
            {group.items.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
