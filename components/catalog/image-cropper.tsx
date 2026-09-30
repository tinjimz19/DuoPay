"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";
import Cropper, { type Area } from "react-easy-crop";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Recorte CUADRADO y dinámico de una foto: se puede arrastrar y acercar hasta
 * dejar el encuadre que se quiera, y siempre sale 1:1. Así todas las fotos del
 * catálogo tienen la misma forma, en pantalla y en el PDF.
 *
 * La foto se normaliza a un lienzo antes de recortar (createImageBitmap con
 * "from-image"): eso hornea la orientación EXIF, que es lo que evita el clásico
 * "la foto vertical sale acostada".
 */
export function ImageCropper({
  file,
  open,
  onCancel,
  onCropped,
}: {
  file: File;
  open: boolean;
  onCancel: () => void;
  onCropped: (file: File) => void;
}) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [areaPixels, setAreaPixels] = React.useState<Area | null>(null);
  const [procesando, setProcesando] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    normalizar(file).then((dataUrl) => {
      if (vivo) setSrc(dataUrl);
    });
    return () => {
      vivo = false;
    };
  }, [file]);

  async function usar() {
    if (!src || !areaPixels) return;
    setProcesando(true);
    try {
      const recorte = await recortarCuadrado(src, areaPixels);
      onCropped(recorte);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
    >
      <DialogContent className="dialog-scroll">
        <DialogHeader>
          <DialogTitle>Recortar foto</DialogTitle>
          <DialogDescription>
            Arrastra y usa el zoom para dejar la foto cuadrada.
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-72 w-full overflow-hidden rounded-lg bg-slate-900">
          {src ? (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, px) => setAreaPixels(px)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="cropper-zoom"
            className="text-xs text-slate-500 dark:text-slate-400"
          >
            Zoom
          </label>
          <input
            id="cropper-zoom"
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-indigo-600"
            aria-label="Acercar la foto"
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1"
            onClick={onCancel}
            disabled={procesando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-11 flex-1"
            onClick={usar}
            disabled={!src || !areaPixels || procesando}
          >
            {procesando && <Loader2 className="animate-spin" />}
            Usar foto
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function fileADataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

/** Endereza la foto (EXIF) pasándola por un lienzo; si algo falla, la deja como venía. */
async function normalizar(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return fileADataURL(file);
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return fileADataURL(file);
  }
}

async function recortarCuadrado(src: string, area: Area): Promise<File> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image();
    el.onload = () => res(el);
    el.onerror = rej;
    el.src = src;
  });

  const size = Math.max(1, Math.round(Math.min(area.width, area.height)));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo recortar la foto");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, area.x, area.y, size, size, 0, 0, size, size);

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/jpeg", 0.9)
  );
  if (!blob) throw new Error("No se pudo recortar la foto");

  return new File([blob], "recorte.jpg", { type: "image/jpeg" });
}
