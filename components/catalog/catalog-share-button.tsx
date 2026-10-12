"use client";

import { Check, Copy, Loader2, Share2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { obtenerLinkCatalogo } from "@/actions/catalog-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Comparte el catálogo público: pide (o crea) el enlace y lo muestra con las
 * dos opciones que pidió la tienda: copiarlo, o abrir el menú de compartir del
 * teléfono (WhatsApp, etc.).
 */
export function CatalogShareButton() {
  const [loading, setLoading] = React.useState(false);
  const [url, setUrl] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [copiado, setCopiado] = React.useState(false);

  async function abrir() {
    setLoading(true);
    const res = await obtenerLinkCatalogo();
    setLoading(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setUrl(`${window.location.origin}/c/${res.slug}`);
    setCopiado(false);
    setOpen(true);
  }

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      toast.success("Link copiado");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No se pudo copiar. Cópialo a mano del cuadro.");
    }
  }

  async function compartir() {
    if (!url) return;
    // El menú nativo del teléfono (incluye WhatsApp). Si no existe —escritorio—
    // se cae a copiar.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Mi catálogo", url });
      } catch {
        // El usuario canceló; no es error.
      }
    } else {
      copiar();
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        onClick={abrir}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        Compartir
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compartir catálogo</DialogTitle>
            <DialogDescription>
              Cualquiera con este enlace puede ver tu catálogo, sin cuenta.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              readOnly
              value={url ?? ""}
              className="h-11"
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Enlace del catálogo"
            />
            <Button type="button" className="h-11 shrink-0" onClick={copiar}>
              {copiado ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Copiar
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={compartir}
          >
            <Share2 className="h-4 w-4" />
            Compartir por…
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
