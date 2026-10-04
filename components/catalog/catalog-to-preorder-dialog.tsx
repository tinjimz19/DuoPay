"use client";

import { Loader2, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { createPreorder } from "@/actions/preorder-actions";
import type { CatalogItem } from "@/components/catalog/catalog-card";
import {
  ClientPicker,
  clientSelectionError,
  type ClientSelection,
} from "@/components/clients/client-picker";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { caracasDateStr, formatCurrency } from "@/lib/format";
import { SIN_VIAJE, etiquetaViajeLarga, type Trip } from "@/lib/trip";

/** El próximo viaje por venir, o "Sin viaje" si no hay. */
function viajeInicial(trips: Trip[]): string {
  const hoy = caracasDateStr();
  return trips.find((t) => t.travel_date >= hoy)?.id ?? SIN_VIAJE;
}

/**
 * Convierte un producto del catálogo en un pedido: se elige el cliente y el
 * viaje, y se crea reusando la misma acción de siempre. El pedido nace
 * "Pendiente" con el nombre, categoría, precio y nota del producto.
 */
export function CatalogToPreorderDialog({
  item,
  clients,
  trips,
  open,
  onOpenChange,
}: {
  item: CatalogItem;
  clients: { id: string; name: string }[];
  trips: Trip[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [client, setClient] = React.useState<ClientSelection>({ kind: "none" });
  const [showClientError, setShowClientError] = React.useState(false);
  const [tripSel, setTripSel] = React.useState<string>(() =>
    viajeInicial(trips)
  );
  const [cantidad, setCantidad] = React.useState("1");

  // Al abrir, el viaje arranca en el próximo por venir.
  React.useEffect(() => {
    if (open) setTripSel(viajeInicial(trips));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function crear() {
    // El cliente es opcional; pero si se eligió "nuevo", se validan sus datos.
    if (clientSelectionError(client, { required: false })) {
      setShowClientError(true);
      return;
    }
    const n = Number(cantidad);
    const cantidadNum = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;

    setLoading(true);
    const res = await createPreorder({
      productName: item.name,
      category: item.category,
      status: "PENDENT",
      notes: item.note,
      quantity: cantidadNum,
      estimatedPrice: item.price,
      clientId: client.kind === "existing" ? client.id : null,
      clientNameRaw: null,
      newClient:
        client.kind === "new"
          ? { name: client.name, phone: client.phone }
          : null,
      tripId: tripSel === SIN_VIAJE ? null : tripSel,
    });
    setLoading(false);

    if (!res.success) {
      toast.error(res.error ?? "No se pudo crear el pedido");
      return;
    }

    toast.success("Pedido creado");
    setClient({ kind: "none" });
    setCantidad("1");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-scroll">
        <DialogHeader>
          <DialogTitle>Crear pedido</DialogTitle>
          <DialogDescription>
            A partir de este producto del catálogo. Elige el cliente y el viaje.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-md object-cover"
            />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {item.name}
            </p>
            {item.price !== null && (
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {formatCurrency(item.price)}
              </p>
            )}
          </div>
        </div>

        <ClientPicker
          clients={clients}
          value={client}
          onChange={(v) => {
            setClient(v);
            setShowClientError(false);
          }}
          showError={showClientError}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="cat-pedido-viaje">Viaje</Label>
            <Select value={tripSel} onValueChange={setTripSel}>
              <SelectTrigger id="cat-pedido-viaje" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VIAJE}>Sin viaje</SelectItem>
                {trips.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {etiquetaViajeLarga(t.travel_date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-pedido-cant">Cantidad</Label>
            <Input
              id="cat-pedido-cant"
              type="number"
              inputMode="numeric"
              min="1"
              className="h-11"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
          </div>
        </div>

        <Button
          type="button"
          className="h-12 w-full"
          onClick={crear}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ShoppingCart className="h-4 w-4" />
          )}
          Crear pedido
        </Button>
      </DialogContent>
    </Dialog>
  );
}
