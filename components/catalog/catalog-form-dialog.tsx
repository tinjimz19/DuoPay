"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2, PackagePlus, X } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  createCatalogProduct,
  setCatalogImage,
  updateCatalogProduct,
} from "@/actions/catalog-actions";
import type { CatalogItem } from "@/components/catalog/catalog-card";
import { useCategories } from "@/components/categories-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BUCKET_DE_CATALOGO,
  revisarFoto,
  rutaDeImagenDeCatalogo,
} from "@/lib/images";
import { encogerFoto, extensionDeArchivo } from "@/lib/images-browser";
import { moneyInputValue, parseMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  name: z.string().min(2, "Escribe el nombre del producto"),
  category: z.string().min(2, "Elige una categoría"),
  price: z
    .string()
    .min(1, "Indica el precio")
    .refine((v) => parseMoney(v) > 0, "El precio debe ser mayor a 0"),
  note: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function CatalogFormDialog({
  product,
  open,
  hideTrigger = false,
  onOpenChange,
}: {
  product?: CatalogItem | null;
  open?: boolean;
  hideTrigger?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const categorias = useCategories();
  const isEdit = Boolean(product);
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const dialogOpen = isControlled ? open : internalOpen;
  const [loading, setLoading] = React.useState(false);

  // Calzado es la categoría principal: un producto nuevo arranca ahí.
  const categoriaPorDefecto = React.useMemo(() => {
    const calzado = categorias.selectable.find((c) => c.slug === "CALZADO");
    return calzado?.slug ?? categorias.selectable[0]?.slug ?? "CALZADO";
  }, [categorias.selectable]);

  // --- la imagen ---
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = React.useState<string | null>(null);
  const [quitarFoto, setQuitarFoto] = React.useState(false);
  const entradaDeArchivo = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!archivo) return;
    const url = URL.createObjectURL(archivo);
    setVistaPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const fotoAMostrar =
    vistaPrevia ?? (quitarFoto ? null : (product?.image_url ?? null));

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: product?.name ?? "",
      category: product?.category ?? categoriaPorDefecto,
      price: moneyInputValue(product?.price ?? undefined),
      note: product?.note ?? "",
    },
  });

  function limpiarFoto() {
    setArchivo(null);
    setVistaPrevia(null);
    setQuitarFoto(false);
    if (entradaDeArchivo.current) entradaDeArchivo.current.value = "";
  }

  function limpiar() {
    form.reset({
      name: "",
      category: categoriaPorDefecto,
      price: "",
      note: "",
    });
    limpiarFoto();
  }

  function elegirArchivo(elegido: File | null) {
    if (!elegido) return;
    const problema = revisarFoto({ tipo: elegido.type, bytes: elegido.size });
    if (problema) {
      toast.error(problema);
      if (entradaDeArchivo.current) entradaDeArchivo.current.value = "";
      return;
    }
    setQuitarFoto(false);
    setArchivo(elegido);
  }

  function handleOpenChange(next: boolean) {
    if (!next && !isEdit) limpiar();
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }

  /**
   * Sube la imagen ya comprimida y apunta su ruta. Se hace DESPUÉS de guardar
   * la fila porque la ruta lleva el id del producto, que no existe hasta que
   * la fila está creada.
   */
  async function guardarImagen(productId: string): Promise<void> {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Se venció la sesión. Vuelve a entrar.");

    if (quitarFoto && !archivo) {
      if (product?.image_path) {
        await supabase.storage.from(BUCKET_DE_CATALOGO).remove([product.image_path]);
      }
      const res = await setCatalogImage(productId, null);
      if (!res.success) throw new Error(res.error ?? "No se pudo quitar la imagen.");
      return;
    }

    if (!archivo) return;

    const listo = await encogerFoto(archivo);
    const ruta = rutaDeImagenDeCatalogo(
      user.id,
      productId,
      extensionDeArchivo(listo)
    );

    const { error } = await supabase.storage
      .from(BUCKET_DE_CATALOGO)
      .upload(ruta, listo, { cacheControl: "3600", upsert: false });
    if (error) throw new Error("No se pudo subir la imagen.");

    const res = await setCatalogImage(productId, ruta);
    if (!res.success) throw new Error(res.error ?? "No se pudo guardar la imagen.");

    // La anterior ya no la apunta nadie: fuera, que el plan es de 1 GB.
    if (product?.image_path && product.image_path !== ruta) {
      await supabase.storage.from(BUCKET_DE_CATALOGO).remove([product.image_path]);
    }
  }

  async function onSubmit(values: Values) {
    setLoading(true);
    const payload = {
      name: values.name,
      category: values.category,
      price: parseMoney(values.price),
      note: values.note?.trim() || null,
    };

    const res = isEdit
      ? await updateCatalogProduct({ id: product!.id, ...payload })
      : await createCatalogProduct(payload);

    if (!res.success) {
      setLoading(false);
      toast.error(res.error ?? "Error al guardar");
      return;
    }

    const productId = isEdit
      ? product!.id
      : ((res as { id?: string }).id ?? "");

    let avisoDeImagen: string | null = null;
    if (productId && (archivo || quitarFoto)) {
      try {
        await guardarImagen(productId);
      } catch (e) {
        avisoDeImagen =
          e instanceof Error ? e.message : "No se pudo guardar la imagen.";
      }
    }

    setLoading(false);

    if (avisoDeImagen) {
      toast.error(
        `${isEdit ? "Producto actualizado" : "Producto agregado"}, pero ${avisoDeImagen.toLowerCase()}`
      );
    } else {
      toast.success(isEdit ? "Producto actualizado" : "Producto agregado");
    }

    if (!isEdit) limpiar();
    handleOpenChange(false);
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button className="h-11">
            <PackagePlus className="h-4 w-4" />
            Agregar producto
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="dialog-scroll">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar producto" : "Agregar producto"}
          </DialogTitle>
          <DialogDescription>
            Imagen, nombre y precio para tu catálogo.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* La imagen se sube aparte, no es un campo del formulario: Label a
                secas, no FormLabel (que lanza fuera de un FormField). */}
            <div className="space-y-2">
              <Label>
                Foto del producto{" "}
                <span className="text-slate-400">(recomendada)</span>
              </Label>
              {fotoAMostrar ? (
                <div className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fotoAMostrar}
                    alt="Foto del producto"
                    className="max-h-56 w-full bg-slate-50 object-contain dark:bg-slate-800/60"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Quitar la foto"
                    className="absolute right-2 top-2 h-9 w-9 bg-white/90 p-0 dark:bg-slate-900/90"
                    onClick={() => {
                      setArchivo(null);
                      setVistaPrevia(null);
                      setQuitarFoto(true);
                      if (entradaDeArchivo.current) {
                        entradaDeArchivo.current.value = "";
                      }
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() => entradaDeArchivo.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                  Agregar foto
                </Button>
              )}
              <input
                ref={entradaDeArchivo}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-slate-400">
                Se comprime sola antes de subir, para no gastar espacio.
              </p>
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Bota alta de cuero"
                      className="h-11"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categorias.selectable.map((c) => (
                          <SelectItem key={c.slug} value={c.slug}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio (€)</FormLabel>
                    <FormControl>
                      <MoneyInput
                        className="h-11"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Nota <span className="text-slate-400">(opcional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Tallas, color, marca…"
                      className="h-11"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="h-12 w-full" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {isEdit ? "Guardar cambios" : "Agregar al catálogo"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
