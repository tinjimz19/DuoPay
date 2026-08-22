import { Boxes } from "lucide-react";

import { InventoryList } from "@/components/inventory/inventory-list";
import type { InventoryProduct } from "@/components/inventory/inventory-list";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { ProductCategory } from "@/types/database.types";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const supabase = createClient();

  const { data: products } = await supabase
    .from("products")
    .select("id, name, category, stock")
    .is("deleted_at", null)
    .order("name");

  const list = (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category as ProductCategory,
    stock: Number(p.stock),
  })) satisfies InventoryProduct[];

  const unidades = list.reduce((sum, p) => sum + Math.max(0, p.stock), 0);
  const agotados = list.filter((p) => p.stock <= 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Inventario
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {list.length === 0
              ? "Lo que tienes disponible para vender"
              : `${list.length} producto${list.length === 1 ? "" : "s"} · ${unidades} unidad${unidades === 1 ? "" : "es"}`}
            {agotados > 0 && (
              <>
                {" · "}
                <span className="font-medium text-red-600 dark:text-red-400">
                  {agotados} sin stock
                </span>
              </>
            )}
          </p>
        </div>
        <ProductFormDialog />
      </div>

      {list.length === 0 ? (
        <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            <Boxes className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            Aún no tienes productos. Agrega el primero y ponle cuántos tienes.
          </CardContent>
        </Card>
      ) : (
        <InventoryList products={list} />
      )}
    </div>
  );
}
