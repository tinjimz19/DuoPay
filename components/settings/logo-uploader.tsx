"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { updateProfile } from "@/actions/auth-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StoreAvatar } from "@/components/store-avatar";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const MAX_ENTRADA = 8 * 1024 * 1024;
/** Lado máximo del logo guardado. Más que esto no se nota en un avatar. */
const LADO = 512;

/**
 * Achica el logo ANTES de subirlo.
 *
 * Sin esto se sube la foto tal como sale del teléfono —cuatro o cinco
 * megas— para pintarla después en un círculo de 36 píxeles. Eso se paga
 * en almacenamiento y, peor, en cada carga de la cabecera con datos
 * móviles. Aquí sale en unas decenas de kilobytes.
 */
async function achicar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, LADO / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    // webp pesa bastante menos; si el navegador no lo hace, cae a png.
    canvas.toBlob(resolve, "image/webp", 0.9)
  );
  if (blob) return blob;

  const png = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!png) throw new Error("No se pudo procesar la imagen");
  return png;
}

export function LogoUploader({
  userId,
  logoUrl,
  businessName,
  fallbackName,
}: {
  userId: string;
  logoUrl: string | null;
  businessName: string | null;
  fallbackName: string;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = React.useState(false);
  const [confirmar, setConfirmar] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  // Mientras el servidor se entera, se muestra ya el logo nuevo.
  const [previo, setPrevio] = React.useState<string | null>(null);

  const actual = previo ?? logoUrl;
  const ocupado = subiendo || pending;

  async function elegir(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Elige una imagen");
      return;
    }
    if (file.size > MAX_ENTRADA) {
      toast.error("La imagen no debe pasar de 8 MB");
      return;
    }

    setSubiendo(true);
    try {
      const blob = await achicar(file);
      const supabase = createClient();
      // El nombre lleva la hora para que el navegador no siga mostrando
      // el logo viejo desde su caché.
      const path = `${userId}/logo-${Date.now()}.webp`;

      const { error: subida } = await supabase.storage
        .from("store-logos")
        .upload(path, blob, { cacheControl: "3600", upsert: true, contentType: blob.type });
      if (subida) throw new Error("No se pudo subir el logo");

      const { data } = supabase.storage.from("store-logos").getPublicUrl(path);
      const res = await updateProfile({ logoUrl: data.publicUrl });
      if (!res.success) throw new Error(res.error ?? "No se pudo guardar el logo");

      setPrevio(data.publicUrl);
      toast.success("Logo actualizado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir el logo");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function quitar() {
    startTransition(async () => {
      const res = await updateProfile({ logoUrl: null });
      if (res.success) {
        setPrevio(null);
        setConfirmar(false);
        toast.success("Logo quitado");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo quitar el logo");
      }
    });
  }

  return (
    <div className="flex items-center gap-4">
      <StoreAvatar
        logoUrl={actual}
        businessName={businessName}
        fallbackName={fallbackName}
        className="h-20 w-20 border border-slate-200 dark:border-slate-700"
      />

      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {actual
            ? "Aparece en tu avatar arriba a la derecha."
            : "Sin logo se muestran tus iniciales."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={ocupado}
            onClick={() => inputRef.current?.click()}
          >
            {subiendo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            {actual ? "Cambiar logo" : "Subir logo"}
          </Button>

          {actual && (
            <Button
              type="button"
              variant="ghost"
              className="h-10 text-slate-500 dark:text-slate-400"
              disabled={ocupado}
              onClick={() => setConfirmar(true)}
            >
              <Trash2 className="h-4 w-4" />
              Quitar
            </Button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void elegir(file);
        }}
      />

      <ConfirmDialog
        open={confirmar}
        onOpenChange={setConfirmar}
        title="¿Quitar el logo?"
        description="Volverás a ver tus iniciales en el avatar. Puedes subir otro cuando quieras."
        confirmLabel="Quitar"
        pending={pending}
        onConfirm={quitar}
      />
    </div>
  );
}
