"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PackagePlus } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createPreorder, updatePreorder } from "@/actions/preorder-actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_OPTIONS, PREORDER_STATUS_OPTIONS } from "@/lib/labels";
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
}

const preorderSchema = z.object({
  productName: z.string().min(2, "Describe el producto solicitado"),
  category: z.enum(["ROPA", "CALZADO", "PERFUME", "OTRO"]),
  clientId: z.string().optional(),
  clientNameRaw: z.string().max(120).optional(),
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
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const [loading, setLoading] = React.useState(false);
  const isEdit = Boolean(preorder);
  const isControlled = open !== undefined;

  const dialogOpen = isControlled ? open : internalOpen;

  const form = useForm<PreorderValues>({
    resolver: zodResolver(preorderSchema),
    defaultValues: {
      productName: preorder?.product_name ?? "",
      category: preorder?.category ?? "PERFUME",
      clientId: preorder?.client_id ?? "",
      clientNameRaw: preorder?.client_name_raw ?? "",
      quantity: String(preorder?.quantity ?? 1),
      estimatedPrice:
        preorder?.estimated_price !== null && preorder?.estimated_price !== undefined
          ? String(preorder.estimated_price)
          : "",
      status: preorder?.status ?? "PENDENT",
      notes: preorder?.notes ?? "",
    },
  });

  const clientId = form.watch("clientId");

  function handleOpenChange(next: boolean) {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  }

  async function onSubmit(values: PreorderValues) {
    setLoading(true);
    const payload = {
      ...values,
      quantity: Number(values.quantity),
      estimatedPrice:
        values.estimatedPrice === "" || values.estimatedPrice === undefined
          ? null
          : Number(values.estimatedPrice),
    };
    const res = isEdit
      ? await updatePreorder({ id: preorder!.id, ...payload })
      : await createPreorder(payload);

    setLoading(false);

    if (!res.success) {
      toast.error(res.error ?? "Error al guardar");
      return;
    }

    toast.success(isEdit ? "Pedido actualizado" : "Pedido anotado");
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
                      {CATEGORY_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Cliente <span className="text-slate-400">(opcional)</span>
                    </FormLabel>
                    <Select
                      onValueChange={(v) =>
                        field.onChange(v === "none" ? "" : v)
                      }
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Cliente no registrado" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">
                          Cliente no registrado
                        </SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!clientId && (
                <FormField
                  control={form.control}
                  name="clientNameRaw"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          placeholder="Nombre del cliente (texto libre)"
                          className="h-11"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

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
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="h-11"
                        {...field}
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