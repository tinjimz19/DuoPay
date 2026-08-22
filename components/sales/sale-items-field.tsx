"use client";

import { Minus, Package, Plus, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ProductCategory } from "@/types/database.types";

export interface StockProduct {
  id: string;
  name: string;
  category: ProductCategory;
  stock: number;
}

export interface SaleItemDraft {
  productId: string;
  quantity: number;
}

/**
 * Qué sale del inventario con esta venta.
 *
 * El freno va por línea: la cantidad no pasa del stock del producto y uno en
 * 0 ni siquiera se puede elegir. Así, en una venta de varios productos, los
 * que sí hay pasan sin estorbo — no existe un "guardar a medias".
 *
 * Dejarlo vacío es válido: la venta se registra con la descripción a mano y
 * no toca el inventario.
 */
export function SaleItemsField({
  products,
  value,
  onChange,
}: {
  products: StockProduct[];
  value: SaleItemDraft[];
  onChange: (items: SaleItemDraft[]) => void;
}) {
  const byId = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  // Un producto ya agregado no se ofrece otra vez: se sube su cantidad.
  const elegidos = new Set(value.map((item) => item.productId));
  const disponibles = products.filter((p) => !elegidos.has(p.id));

  function agregar(productId: string) {
    if (!productId) return;
    onChange([...value, { productId, quantity: 1 }]);
  }

  function cambiarCantidad(productId: string, quantity: number) {
    const product = byId.get(productId);
    const tope = product ? product.stock : 1;
    const limpia = Math.max(1, Math.min(quantity, Math.max(1, tope)));
    onChange(
      value.map((item) =>
        item.productId === productId ? { ...item, quantity: limpia } : item
      )
    );
  }

  function quitar(productId: string) {
    onChange(value.filter((item) => item.productId !== productId));
  }

  return (
    <div className="space-y-2">
      <Label>
        Del inventario{" "}
        <span className="text-slate-400">(opcional)</span>
      </Label>

      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((item) => {
            const product = byId.get(item.productId);
            if (!product) return null;
            const enTope = item.quantity >= product.stock;

            return (
              <div
                key={item.productId}
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {product.name}
                  </p>
                  <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                    {CATEGORY_LABELS[product.category]} · quedan{" "}
                    {product.stock - item.quantity} de {product.stock}
                  </p>
                </div>

                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 shrink-0"
                  disabled={item.quantity <= 1}
                  onClick={() =>
                    cambiarCantidad(item.productId, item.quantity - 1)
                  }
                  aria-label={`Quitar una unidad de ${product.name}`}
                >
                  <Minus className="h-4 w-4" />
                </Button>

                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={product.stock}
                  step="1"
                  className="h-9 w-16 shrink-0 text-center tabular-nums"
                  value={item.quantity}
                  onChange={(e) =>
                    cambiarCantidad(item.productId, Number(e.target.value) || 1)
                  }
                  aria-label={`Cantidad de ${product.name}`}
                />

                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 shrink-0"
                  disabled={enTope}
                  onClick={() =>
                    cambiarCantidad(item.productId, item.quantity + 1)
                  }
                  aria-label={`Agregar una unidad de ${product.name}`}
                  title={enTope ? `Solo tienes ${product.stock}` : undefined}
                >
                  <Plus className="h-4 w-4" />
                </Button>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-slate-400 hover:text-destructive"
                  onClick={() => quitar(item.productId)}
                  aria-label={`Quitar ${product.name} de la venta`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Todavía no tienes productos cargados. Puedes registrar la venta
          escribiendo la mercancía a mano.
        </p>
      ) : (
        <Select value="" onValueChange={agregar}>
          <SelectTrigger className="h-11">
            <SelectValue
              placeholder={
                value.length > 0 ? "Agregar otro producto" : "Elegir del inventario"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {disponibles.map((product) => {
              const agotado = product.stock <= 0;
              return (
                <SelectItem
                  key={product.id}
                  value={product.id}
                  disabled={agotado}
                  className={cn(agotado && "opacity-60")}
                >
                  {product.name} ·{" "}
                  {agotado ? "sin stock" : `${product.stock} disponibles`}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}

      {value.length === 0 && products.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Si eliges productos, se descuentan del inventario al guardar.
        </p>
      )}
    </div>
  );
}
