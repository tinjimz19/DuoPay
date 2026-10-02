"use client";

import { PackageSearch } from "lucide-react";
import * as React from "react";

import { Paginacion, usePagination } from "@/components/pagination";
import { PreorderCard, type PreorderCardData } from "@/components/preorders/preorder-card";
import { PreorderExportButton } from "@/components/preorders/preorder-export-button";
import { PreorderFormDialog } from "@/components/preorders/preorder-form-dialog";
import { TripsBar } from "@/components/preorders/trips-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { caracasDateStr } from "@/lib/format";
import { SIN_VIAJE, etiquetaViajeLarga, type Trip } from "@/lib/trip";
import type { PreorderStatus } from "@/types/database.types";

const CATEGORY_TABS = [
  { value: "CALZADO", label: "Calzado" },
  { value: "ROPA", label: "Ropa" },
  { value: "PERFUME", label: "Perfume" },
  { value: "OTRO", label: "Otro" },
] as const;

const STATUS_TABS: { value: PreorderStatus; label: string }[] = [
  { value: "PENDENT", label: "Pend" },
  { value: "ORDERED", label: "Comp" },
  { value: "DELIVERED", label: "Entreg" },
  { value: "CANCELLED", label: "Cancel" },
];

/** El viaje en el que abre la pantalla: el próximo por venir, o "Sin viaje". */
function viajeInicial(trips: Trip[]): string {
  const hoy = caracasDateStr();
  const proximo = trips.find((t) => t.travel_date >= hoy);
  return proximo?.id ?? SIN_VIAJE;
}

export function PreorderList({
  preorders,
  clients,
  trips,
  openNew = false,
}: {
  preorders: PreorderCardData[];
  clients: { id: string; name: string }[];
  trips: Trip[];
  openNew?: boolean;
}) {
  const [trip, setTrip] = React.useState<string>(() => viajeInicial(trips));
  // Arranca en Calzado, que es la categoría que más se encarga.
  const [category, setCategory] = React.useState<string>("CALZADO");
  // Se abre en lo que falta por comprar, que es el trabajo del día.
  const [status, setStatus] = React.useState<PreorderStatus>("PENDENT");

  const coincideViaje = React.useCallback(
    (p: PreorderCardData) =>
      trip === SIN_VIAJE ? p.trip_id === null : p.trip_id === trip,
    [trip]
  );

  // Todos los del viaje (cualquier categoría/estado): es lo que exporta el TXT.
  const delViaje = React.useMemo(
    () => preorders.filter(coincideViaje),
    [preorders, coincideViaje]
  );

  const filtered = React.useMemo(
    () =>
      delViaje.filter((p) => p.category === category && p.status === status),
    [delViaje, category, status]
  );

  const pagina = usePagination(filtered, {
    resetKey: `${trip}|${category}|${status}`,
  });

  const viajeSel = trips.find((t) => t.id === trip) ?? null;
  const tripTitulo = viajeSel
    ? `Viaje ${etiquetaViajeLarga(viajeSel.travel_date)}`
    : "Sin viaje";
  const tripArchivo = viajeSel ? `viaje-${viajeSel.travel_date}` : "sin-viaje";

  return (
    <div className="scroll-mt-24 space-y-4" ref={pagina.topRef}>
      <div className="space-y-3">
        <TripsBar trips={trips} selected={trip} onSelect={setTrip} />

        <div className="flex items-center justify-between gap-2">
          <PreorderFormDialog
            clients={clients}
            trips={trips}
            defaultTripId={trip === SIN_VIAJE ? null : trip}
            defaultOpen={openNew}
          />
          <PreorderExportButton
            preorders={delViaje}
            tripTitulo={tripTitulo}
            tripArchivo={tripArchivo}
          />
        </div>

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
          {pagina.items.map((preorder) => (
            <PreorderCard
              key={preorder.id}
              preorder={preorder}
              clients={clients}
              trips={trips}
            />
          ))}
        </div>
      )}

      <Paginacion pagination={pagina} noun="pedidos" />
    </div>
  );
}
