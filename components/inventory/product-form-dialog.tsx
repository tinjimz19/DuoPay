"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { createProduct, updateProduct } from "@/actions/product-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_OPTIONS } from "@/lib/labels";
import type { ProductCategory } from "@/types/database.types";

export function ProductFormDialog({
  product,
}: {
  /** Sin producto es alta; con producto, edición del nombre y la categoría. */
  product?: { id: string; name: string; category: ProductCategory };
}) {
  const router = useRouter();
  const isEdit = !!product;

  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [name, setName] = React.useState(product?.name ?? "");
  const [category, setCategory] = React.useState<ProductCategory>(
    product?.category ?? "OTRO"
  );
  const [initialStock, setInitialStock] = React.useState("0");

  React.useEffect(() => {
    if (!open) return;
    setName(product?.name ?? "");
    setCategory(product?.category ?? "OTRO");
    setInitialStock("0");
  }, [open, product]);

  function submit() {
    startTransition(async () => {
      const res = isEdit
        ? await updateProduct({ id: product!.id, name, category })
        : await createProduct({
            name,
            category,
            initialStock: Number(initialStock) || 0,
          });

      if (res.success) {
        toast.success(isEdit ? "Producto actualizado" : "Producto agregado");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-slate-400"
            aria-label={`Editar ${product!.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button className="h-11 shrink-0">
            <Plus className="h-4 w-4" />
            Producto
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar producto" : "Nuevo producto"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Para cambiar la cantidad usa los botones de la lista."
              : "Solo el nombre, la categoría y cuántos tienes."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="producto-nombre">Producto</Label>
            <Input
              id="producto-nombre"
              placeholder="Ej: Camisas"
              className="h-11"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="producto-categoria">Categoría</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as ProductCategory)}
            >
              <SelectTrigger id="producto-categoria" className="h-11">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="producto-stock">¿Cuántos tienes?</Label>
              <Input
                id="producto-stock"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                className="h-11"
                value={initialStock}
                onChange={(e) => setInitialStock(e.target.value)}
              />
            </div>
          )}

          <Button
            type="button"
            className="h-12 w-full text-sm"
            disabled={pending || name.trim().length < 2}
            onClick={submit}
          >
            {pending && <Loader2 className="animate-spin" />}
            {isEdit ? "Guardar cambios" : "Agregar producto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
