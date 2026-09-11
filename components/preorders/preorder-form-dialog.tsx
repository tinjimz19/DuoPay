"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2, PackagePlus, X } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  createPreorder,
  setPreorderImage,
  updatePreorder,
} from "@/actions/preorder-actions";
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
import { moneyInputValue, parseMoney } from "@/lib/money";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCategories } from "@/components/categories-provider";
import {
  BUCKET_DE_PEDIDOS,
  revisarFoto,
  rutaDeFotoDePedido,
} from "@/lib/images";
import { encogerFoto, extensionDeArchivo } from "@/lib/images-browser";
import { PREORDER_STATUS_OPTIONS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import type { PreorderStatus, ProductCategory } from "@/types/database.types";

export interface PreorderFormData {
  id: string;
  product_name: string;
  category: ProductCategory;
  client_id: string | null;
  client_name_raw: string | null;
  quantity: number | null;
  estimated_price: number | null;
  status: PreorderStatus;
  notes: string | null;
  image_path?: string | null;
  /** Dirección firmada de la foto que ya tiene, para la vista previa. */
  image_url?: string | null;
}

const preorderSchema = z.object({
  productName: z.string().min(2, "Describe el producto solicitado"),
  category: z.string().min(2, "Elige una categoría"),
  quantity: z
    .string()
    .min(1, "Indica la cantidad")
    .refine(
      (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1000,
      "Entre 1 y 1000"
    ),
  estimatedPrice: z.string().optional(),
  status: z.enum(["PENDENT", "ORDERED", "DELIVERED", "CANCELLED"]),
  notes: z.string().optional(),
});

type PreorderValues = z.infer<typeof preorderSchema>;

export function PreorderFormDialog({
  preorder,
  clients,
  defaultOpen = false,
  open,
  hideTrigger = false,
  onOpenChange,
}: {
  preorder?: PreorderFormData | null;
  clients: { id: string; name: string }[];
  defaultOpen?: boolean;
  open?: boolean;
  hideTrigger?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const categorias = useCategories();
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const [loading, setLoading] = React.useState(false);
  const [client, setClient] = React.useState<ClientSelection>(
    preorder?.client_id
      ? { kind: "existing", id: preorder.client_id }
      : { kind: "none" }
  );
  const [showClientError, setShowClientError] = React.useState(false);

  // --- la foto ---------------------------------------------------------
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = React.useState<string | null>(null);
  const [quitarFoto, setQuitarFoto] = React.useState(false);
  const entradaDeArchivo = React.useRef<HTMLInputElement>(null);

  // La vista previa es una URL de objeto y hay que devolverla: si no, el
  // navegador se queda con la foto entera en memoria cada vez que se abre.
  React.useEffect(() => {
    if (!archivo) return;
    const url = URL.createObjectURL(archivo);
    setVistaPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const fotoAMostrar =
    vistaPrevia ?? (quitarFoto ? null : (preorder?.image_url ?? null));

  const isEdit = Boolean(preorder);
  const isControlled = open !== undefined;

  const dialogOpen = isControlled ? open : internalOpen;

  const form = useForm<PreorderValues>({
    resolver: zodResolver(preorderSchema),
    defaultValues: {
      productName: preorder?.product_name ?? "",
      category: preorder?.category ?? categorias.selectable[0]?.slug ?? "OTRO",
      quantity: String(preorder?.quantity ?? 1),
      estimatedPrice: moneyInputValue(preorder?.estimated_price),
      status: preorder?.status ?? "PENDENT",
      notes: preorder?.notes ?? "",
    },
  });

  const vacio = React.useMemo(
    () => ({
      productName: "",
      category: categorias.selectable[0]?.slug ?? "OTRO",
      quantity: "1",
      estimatedPrice: "",
      status: "PENDENT" as const,
      notes: "",
    }),
    [categorias.selectable]
  );

  function limpiar() {
    form.reset(vacio);
    setClient({ kind: "none" });
    setShowClientError(false);
    limpiarFoto();
  }

  function limpiarFoto() {
    setArchivo(null);
    setVistaPrevia(null);
    setQuitarFoto(false);
    if (entradaDeArchivo.current) entradaDeArchivo.current.value = "";
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

  /**
   * Sube la foto y apunta su ruta en el pedido.
   *
   * Se hace DESPUÉS de guardar, no antes, porque la ruta lleva el id del
   * pedido y ese id no existe hasta que la fila está creada. El precio de
   * hacerlo así es que la foto puede fallar con el pedido ya guardado; por
   * eso se avisa aparte en vez de decir que todo falló, que sería mentira.
   */
  async function guardarFoto(pedidoId: string): Promise<void> {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Se venció la sesión. Vuelve a entrar.");

    // Quitar: primero el archivo, después la columna. Al revés quedaría el
    // archivo ocupando sitio para siempre, sin nada que apunte a él.
    if (quitarFoto && !archivo) {
      if (preorder?.image_path) {
        await supabase.storage
          .from(BUCKET_DE_PEDIDOS)
          .remove([preorder.image_path]);
      }
      const res = await setPreorderImage(pedidoId, null);
      if (!res.success) throw new Error(res.error ?? "No se pudo quitar la foto.");
      return;
    }

    if (!archivo) return;

    const listo = await encogerFoto(archivo);
    const ruta = rutaDeFotoDePedido(user.id, pedidoId, extensionDeArchivo(listo));

    const { error } = await supabase.storage
      .from(BUCKET_DE_PEDIDOS)
      .upload(ruta, listo, { cacheControl: "3600", upsert: false });
    if (error) throw new Error("No se pudo subir la foto.");

    const res = await setPreorderImage(pedidoId, ruta);
    if (!res.success) throw new Error(res.error ?? "No se pudo guardar la foto.");

    // La anterior ya no la apunta nadie: fuera, que el plan es de 1 GB.
    if (preorder?.image_path && preorder.image_path !== ruta) {
      await supabase.storage
        .from(BUCKET_DE_PEDIDOS)
        .remove([preorder.image_path]);
    }
  }

  function handleOpenChange(next: boolean) {
    // Al cerrar un alta, el formulario queda limpio para la próxima vez: el
    // diálogo no se desmonta, así que si no se resetea reaparecen los datos.
    if (!next && !isEdit) {
      limpiar();
    }
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  }

  async function onSubmit(values: PreorderValues) {
    if (clientSelectionError(client, { required: false })) {
      setShowClientError(true);
      return;
    }

    setLoading(true);
    const payload = {
      ...values,
      clientId: client.kind === "existing" ? client.id : null,
      // Los pedidos viejos guardaban un nombre suelto. Si este es uno de
      // esos y no se eligió cliente, se conserva en vez de borrarse.
      clientNameRaw:
        client.kind === "none" ? (preorder?.client_name_raw ?? null) : null,
      newClient:
        client.kind === "new"
          ? { name: client.name, phone: client.phone }
          : null,
      quantity: Number(values.quantity),
      estimatedPrice:
        values.estimatedPrice === "" || values.estimatedPrice === undefined
          ? null
          : parseMoney(values.estimatedPrice),
    };
    const res = isEdit
      ? await updatePreorder({ id: preorder!.id, ...payload })
      : await createPreorder(payload);

    if (!res.success) {
      setLoading(false);
      toast.error(res.error ?? "Error al guardar");
      return;
    }

    /*
      `createPreorder` devuelve el id y `updatePreorder` no, asi que el tipo
      de la union no tiene un `id` comun. Se lee opcional en vez de forzar
      el tipo: si algun dia deja de venir, aqui no se sube la foto y se
      avisa, en lugar de intentar subirla a una ruta con "undefined".
    */
    const pedidoId = isEdit ? preorder!.id : ((res as { id?: string }).id ?? "");

    let avisoDeFoto: string | null = null;
    if (pedidoId && (archivo || quitarFoto)) {
      try {
        await guardarFoto(pedidoId);
      } catch (e) {
        avisoDeFoto = e instanceof Error ? e.message : "No se pudo guardar la foto.";
      }
    }

    setLoading(false);

    if (avisoDeFoto) {
      // El pedido SÍ se guardó. Decir "error al guardar" a secas sería
      // mentira y la tienda lo volvería a anotar, duplicándolo.
      toast.error(
        `${isEdit ? "Pedido actualizado" : "Pedido anotado"}, pero ${avisoDeFoto.toLowerCase()}`
      );
    } else {
      toast.success(isEdit ? "Pedido actualizado" : "Pedido anotado");
    }
    if (!isEdit) {
      limpiar();
    }
    handleOpenChange(false);
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          {isEdit ? (
            <Button variant="ghost" className="h-8 px-2 text-xs">
              Editar
            </Button>
          ) : (
            <Button className="h-11">
              <PackagePlus className="h-4 w-4" />
              Nuevo pedido
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="dialog-scroll">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar pedido" : "Anotar pedido"}</DialogTitle>
          <DialogDescription>
            Encargo del cliente para la próxima compra de mercancía.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="productName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Producto solicitado</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Perfume Sauvage Dior 100ml"
                      className="h-11"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/*
              Label a secas, NO FormLabel.

              `FormLabel` llama por dentro a `useFormField()`, que LANZA si no
              está dentro de un `<FormField>`. Este bloque no es un campo del
              formulario —la foto es un archivo que se sube aparte, no un
              valor que viaje en el submit—, así que aquí `FormLabel` rompe
              el diálogo entero al abrirlo. Es el mismo motivo por el que
              `ClientPicker` usa `Label`.
            */}
            <div className="space-y-2">
              <Label>
                Foto de referencia{" "}
                <span className="text-slate-400">(opcional)</span>
              </Label>
              {fotoAMostrar ? (
                <div className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fotoAMostrar}
                    alt="Foto del producto pedido"
                    className="max-h-48 w-full bg-slate-50 object-contain dark:bg-slate-800/60"
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
                Se encoge sola antes de subir. Sirve para recordar cuál era
                exactamente el producto que te pidieron.
              </p>
            </div>

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
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        className="h-11"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="estimatedPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Precio est. ($){" "}
                      <span className="text-slate-400">(opcional)</span>
                    </FormLabel>
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

            {isEdit && (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PREORDER_STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Notas <span className="text-slate-400">(opcional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Talla, marca, estilo, aroma..."
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="h-12 w-full" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {isEdit ? "Guardar cambios" : "Anotar pedido"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}