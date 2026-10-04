"use client";

import { ImagePlus, Loader2, ShoppingCart, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { createPreorder, setPreorderImage } from "@/actions/preorder-actions";
import type { CatalogItem } from "@/components/catalog/catalog-card";
import { ImageCropper } from "@/components/catalog/image-cropper";
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
import { Textarea } from "@/components/ui/textarea";
import { caracasDateStr, formatCurrency } from "@/lib/format";
import {
  BUCKET_DE_PEDIDOS,
  refDeCatalogo,
  revisarFoto,
  rutaDeFotoDePedido,
} from "@/lib/images";
import { encogerFoto, extensionDeArchivo } from "@/lib/images-browser";
import { createClient } from "@/lib/supabase/client";
import { SIN_VIAJE, etiquetaViajeLarga, type Trip } from "@/lib/trip";

/** El próximo viaje por venir, o "Sin viaje" si no hay. */
function viajeInicial(trips: Trip[]): string {
  const hoy = caracasDateStr();
  return trips.find((t) => t.travel_date >= hoy)?.id ?? SIN_VIAJE;
}

/**
 * Convierte un producto del catálogo en un pedido: se elige el cliente y el
 * viaje, y se crea reusando la misma acción de siempre.
 *
 * LA FOTO
 *
 * Por defecto el pedido REUSA la foto del catálogo: no se resube ni se
 * duplica, apunta al mismo archivo (la referencia "catalogo:…"). Si se quiere,
 * se puede sustituir por otra foto, que esa sí se recorta y se sube al pedido.
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
  // Detalles del pedido. Arranca con la nota del catálogo (tallas, color…) y
  // se puede ajustar para lo que pidió este cliente en particular.
  const [notas, setNotas] = React.useState(item.note ?? "");

  // Sustitución de foto (opcional). `archivo` lleno = se sube esa en vez de
  // reusar la del catálogo.
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = React.useState<string | null>(null);
  const [recorte, setRecorte] = React.useState<File | null>(null);
  const entradaDeArchivo = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!archivo) return;
    const url = URL.createObjectURL(archivo);
    setVistaPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  // Al abrir, el viaje arranca en el próximo por venir.
  React.useEffect(() => {
    if (open) {
      setTripSel(viajeInicial(trips));
      setNotas(item.note ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fotoAMostrar = vistaPrevia ?? item.image_url;
  const sustituida = archivo !== null;

  function elegirArchivo(elegido: File | null) {
    if (!elegido) return;
    const problema = revisarFoto({ tipo: elegido.type, bytes: elegido.size });
    if (problema) {
      toast.error(problema);
      if (entradaDeArchivo.current) entradaDeArchivo.current.value = "";
      return;
    }
    setRecorte(elegido);
    if (entradaDeArchivo.current) entradaDeArchivo.current.value = "";
  }

  function volverAlCatalogo() {
    setArchivo(null);
    setVistaPrevia(null);
    if (entradaDeArchivo.current) entradaDeArchivo.current.value = "";
  }

  /** Pone la foto del pedido: la nueva subida, o la referencia del catálogo. */
  async function guardarFoto(pedidoId: string): Promise<void> {
    if (archivo) {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Se venció la sesión. Vuelve a entrar.");

      const listo = await encogerFoto(archivo);
      const ruta = rutaDeFotoDePedido(
        user.id,
        pedidoId,
        extensionDeArchivo(listo)
      );
      const { error } = await supabase.storage
        .from(BUCKET_DE_PEDIDOS)
        .upload(ruta, listo, { cacheControl: "3600", upsert: false });
      if (error) throw new Error("No se pudo subir la foto.");

      const res = await setPreorderImage(pedidoId, ruta);
      if (!res.success) throw new Error(res.error ?? "No se pudo guardar la foto.");
      return;
    }

    // Reusar la del catálogo: el MISMO archivo, sin resubir ni duplicar.
    if (item.image_path) {
      const res = await setPreorderImage(pedidoId, refDeCatalogo(item.image_path));
      if (!res.success)
        throw new Error(res.error ?? "No se pudo asignar la foto.");
    }
  }

  async function crear() {
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
      notes: notas.trim() || null,
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

    if (!res.success) {
      setLoading(false);
      toast.error(res.error ?? "No se pudo crear el pedido");
      return;
    }

    // El id viene opcional en el tipo de retorno; se protege antes de usarlo.
    const pedidoId = res.id ?? "";
    let avisoFoto: string | null = null;
    if (pedidoId) {
      try {
        await guardarFoto(pedidoId);
      } catch (e) {
        avisoFoto =
          e instanceof Error ? e.message : "No se pudo guardar la foto.";
      }
    }
    setLoading(false);

    if (avisoFoto) {
      toast.error(`Pedido creado, pero ${avisoFoto.toLowerCase()}`);
    } else {
      toast.success("Pedido creado");
    }

    setClient({ kind: "none" });
    setCantidad("1");
    volverAlCatalogo();
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

        <div>
          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {item.name}
          </p>
          {item.price !== null && (
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {formatCurrency(item.price)}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Foto</Label>
          {fotoAMostrar ? (
            <div className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fotoAMostrar}
                alt=""
                className="max-h-44 w-full bg-slate-50 object-contain dark:bg-slate-800/60"
              />
              {sustituida && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Volver a la foto del catálogo"
                  className="absolute right-2 top-2 h-9 w-9 bg-white/90 p-0 dark:bg-slate-900/90"
                  onClick={volverAlCatalogo}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="h-10 w-full"
            onClick={() => entradaDeArchivo.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            {fotoAMostrar ? "Cambiar foto" : "Agregar foto"}
          </Button>
          <input
            ref={entradaDeArchivo}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-slate-400">
            {sustituida
              ? "Foto nueva: se recorta y se sube a este pedido."
              : item.image_url
                ? "Se reutiliza la foto del catálogo (el mismo archivo, sin resubir)."
                : "Este producto no tiene foto en el catálogo."}
          </p>
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

        <div className="space-y-2">
          <Label htmlFor="cat-pedido-notas">
            Detalles <span className="text-slate-400">(opcional)</span>
          </Label>
          <Textarea
            id="cat-pedido-notas"
            rows={2}
            placeholder="Talla, color, marca…"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
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

        {recorte && (
          <ImageCropper
            file={recorte}
            open
            onCancel={() => setRecorte(null)}
            onCropped={(recortada) => {
              setArchivo(recortada);
              setRecorte(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
