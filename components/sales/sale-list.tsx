"use client";

import { ShoppingBag } from "lucide-react";
import * as React from "react";

import { SaleCard, type SaleCardData } from "@/components/sales/sale-card";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const FILTERS = [
  { value: "all", label: "Todos" },
  { value: "PENDING", label: "Pendientes" },
  { value: "PARTIAL", label: "En cuotas" },
  { value: "COMPLETED", label: "Saldados" },
] as const;

export function SaleList({
  sales,
  businessName,
}: {
  sales: SaleCardData[];
  businessName?: string | null;
}) {
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["value"]>("all");
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return sales.filter((s) => {
      const matchesFilter = filter === "all" || s.status === filter;
      const matchesQuery =
        !q ||
        s.item_description.toLowerCase().includes(q) ||
        s.client_name.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [sales, filter, query]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Tabs
          value={filter}
          onValueChange={(v) =>
            setFilter(v as (typeof FILTERS)[number]["value"])
          }
        >
          <TabsList className="grid w-full grid-cols-4">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          className="h-11"
          placeholder="Buscar venta o cliente"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            <ShoppingBag className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            No hay ventas que coincidan.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((sale) => (
            <SaleCard key={sale.id} sale={sale} businessName={businessName} />
          ))}
        </div>
      )}
    </div>
  );
}