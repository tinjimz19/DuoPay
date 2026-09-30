"use client";

import { PackageSearch } from "lucide-react";
import * as React from "react";

import { CatalogCard, type CatalogItem } from "@/components/catalog/catalog-card";
import { CatalogExportButton } from "@/components/catalog/catalog-export-button";
import { useCategories } from "@/components/categories-provider";
import { Card, CardContent } from "@/components/ui/card";
import { ordenarCategorias } from "@/lib/catalog-order";

export function CatalogList({ items }: { items: CatalogItem[] }) {
  const categorias = useCategories();

  const grupos = React.useMemo(() => {
    const porCategoria = new Map<string, CatalogItem[]>();
    for (const item of items) {
      const lista = porCategoria.get(item.category) ?? [];
      lista.push(item);
      porCategoria.set(item.category, lista);
    }
    const orden = ordenarCategorias(
      Array.from(porCategoria.keys()),
      (slug) => categorias.label(slug)
    );
    return orden.map((slug) => ({
      slug,
      label: categorias.label(slug),
      items: porCategoria.get(slug) ?? [],
    }));
  }, [items, categorias]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {items.length} {items.length === 1 ? "producto" : "productos"}
        </p>
        <CatalogExportButton
          items={items}
          categoryLabel={(slug) => categorias.label(slug)}
        />
      </div>

      {items.length === 0 ? (
        <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            <PackageSearch className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            Tu catálogo está vacío. Agrega tu primer producto.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grupos.map((grupo) => (
            <section key={grupo.slug} className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                {grupo.label}{" "}
                <span className="text-slate-400">({grupo.items.length})</span>
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {grupo.items.map((item) => (
                  <CatalogCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
