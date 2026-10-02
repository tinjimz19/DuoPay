"use client";

import { CalendarPlus, Loader2, Plane, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { createTrip, deleteTrip } from "@/actions/trip-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SIN_VIAJE, etiquetaViajeCorta, etiquetaViajeLarga, type Trip } from "@/lib/trip";
import { cn } from "@/lib/utils";

/**
 * La fila de viajes: "Sin viaje" + un chip por cada viaje, más el botón para
 * crear o borrar viajes. Elegir un chip filtra los pedidos de ese viaje y
 * hace que un pedido nuevo nazca en él.
 */
export function TripsBar({
  trips,
  selected,
  onSelect,
}: {
  trips: Trip[];
  /** SIN_VIAJE o el id del viaje. */
  selected: string;
  onSelect: (value: string) => void;
}) {
  const router = useRouter();
  const [manage, setManage] = React.useState(false);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <Chip active={selected === SIN_VIAJE} onClick={() => onSelect(SIN_VIAJE)}>
        Sin viaje
      </Chip>

      {trips.map((t) => (
        <Chip
          key={t.id}
          active={selected === t.id}
          onClick={() => onSelect(t.id)}
        >
          <Plane className="h-3.5 w-3.5" />
          {etiquetaViajeCorta(t.travel_date)}
        </Chip>
      ))}

      <button
        type="button"
        onClick={() => setManage(true)}
        className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <Plus className="h-3.5 w-3.5" />
        Viaje
      </button>

      <TripsManager
        open={manage}
        onOpenChange={setManage}
        trips={trips}
        onCreated={(id) => {
          onSelect(id);
          router.refresh();
        }}
        onDeleted={(deletedId) => {
          if (selected === deletedId) onSelect(SIN_VIAJE);
          router.refresh();
        }}
      />
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
        active
          ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
          : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      )}
    >
      {children}
    </button>
  );
}

function TripsManager({
  open,
  onOpenChange,
  trips,
  onCreated,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trips: Trip[];
  onCreated: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [fecha, setFecha] = React.useState("");
  const [creando, setCreando] = React.useState(false);
  const [porBorrar, setPorBorrar] = React.useState<Trip | null>(null);
  const [borrando, setBorrando] = React.useState(false);

  async function crear() {
    if (!fecha) {
      toast.error("Elige la fecha del viaje");
      return;
    }
    setCreando(true);
    const res = await createTrip({ date: fecha });
    setCreando(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Viaje creado");
    setFecha("");
    onOpenChange(false);
    onCreated(res.id);
  }

  async function borrar() {
    if (!porBorrar) return;
    setBorrando(true);
    const res = await deleteTrip(porBorrar.id);
    setBorrando(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Viaje eliminado");
    const id = porBorrar.id;
    setPorBorrar(null);
    onDeleted(id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-scroll">
        <DialogHeader>
          <DialogTitle>Viajes</DialogTitle>
          <DialogDescription>
            Crea un viaje por su fecha y ancla tus pedidos a él.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="nueva-fecha-viaje">Fecha del nuevo viaje</Label>
          <div className="flex gap-2">
            <Input
              id="nueva-fecha-viaje"
              type="date"
              className="h-11"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            <Button
              type="button"
              className="h-11 shrink-0"
              onClick={crear}
              disabled={creando}
            >
              {creando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarPlus className="h-4 w-4" />
              )}
              Crear
            </Button>
          </div>
        </div>

        {trips.length > 0 && (
          <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Viajes ({trips.length})
            </p>
            {trips.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
              >
                <span className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <Plane className="h-4 w-4 text-indigo-500" />
                  {etiquetaViajeLarga(t.travel_date)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-destructive"
                  onClick={() => setPorBorrar(t)}
                  aria-label={`Eliminar el viaje del ${etiquetaViajeLarga(t.travel_date)}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-slate-400">
              Al borrar un viaje, sus pedidos quedan en “Sin viaje”, no se
              pierden.
            </p>
          </div>
        )}

        <ConfirmDialog
          open={porBorrar !== null}
          onOpenChange={(v) => {
            if (!v) setPorBorrar(null);
          }}
          title="¿Eliminar este viaje?"
          description={
            porBorrar ? (
              <>
                Se elimina el viaje del{" "}
                <span className="font-medium">
                  {etiquetaViajeLarga(porBorrar.travel_date)}
                </span>
                . Sus pedidos quedan en “Sin viaje”.
              </>
            ) : (
              ""
            )
          }
          confirmLabel="Eliminar viaje"
          pending={borrando}
          onConfirm={borrar}
        />
      </DialogContent>
    </Dialog>
  );
}
