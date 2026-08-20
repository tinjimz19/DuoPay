"use client";

import { PackageSearch } from "lucide-react";
import * as React from "react";

import { PreorderCard, type PreorderCardData } from "@/components/preorders/preorder-card";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PreorderStatus } from "@/types/database.types";

const CATEGORY_TABS = [
  { value: "all", label: "Todas" },
  { value: "ROPA", label: "Ropa" },
  { value: "CALZADO", label: "Calzado" },
  { value: "PERFUME", label: "Perfume" },
  { value: "OTRO", label: "Otro" },
] as const;

const STATUS_TABS: { value: "all" | PreorderStatus; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "PENDENT", label: "Pendiente" },
  { value: "ORDERED", label: "Comprado" },
  { value: "DELIVERED", label: "Entregado" },
  { value: "CANCELLED", label: "Cancelado" },
];

export function PreorderList({
  preorders,
  clients,
}: {
  preorders: PreorderCardData[];
  clients: { id: string; name: string }[];
}) {
  const [category, setCategory] = React.useState<string>("all");
  const [status, setStatus] = React.useState<"all" | PreorderStatus>("all");

  const filtered = React.useMemo(() => {
    return preorders.filter((p) => {
      const matchesCategory = category === "all" || p.category === category;
      const matchesStatus = status === "all" || p.status === status;
      return matchesCategory && matchesStatus;
    });
  }, [preorders, category, status]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Tabs value={category} onValueChange={setCategory}>
          <TabsList className="w-full">
            {CATEGORY_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-1">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <TabsList className="w-full">
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-1">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            <PackageSearch className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            No hay pedidos que coincidan.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((preorder) => (
            <PreorderCard
              key={preorder.id}
              preorder={preorder}
              clients={clients}
            />
          ))}
        </div>
      )}
    </div>
  );
}