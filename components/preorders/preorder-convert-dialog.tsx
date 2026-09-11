"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { convertPreorderToSale } from "@/actions/preorder-actions";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { formatCurrency } from "@/lib/format";
import type { PreorderCardData } from "@/components/preorders/preorder-card";

const convertSchema = z.object({
  clientId: z.string().min(1, "Selecciona un cliente"),
  itemDescription: z.string().min(3, "Describe la mercancía").max(300),
  totalAmount: z
    .string()
    .min(1, "Escribe el monto")
    .refine((v) => Number(v.replace(",", ".")) > 0, "El monto debe ser mayor a 0"),
  installmentsCount: z
    .string()
    .refine(
      (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 36,
      "Entre 1 y 36 cuotas"
    ),
  notes: z.string().max(500).optional(),
});

type ConvertValues = z.infer<typeof convertSchema>;

/**
 * De encargo a venta.
 *
 * QUÉ SE PREGUNTA Y QUÉ NO
 *
 * Un pedido y una venta no guardan lo mismo, así que convertir no es
 * copiar: hay tres huecos que el pedido no tiene y la venta necesita.
 *
 *   El cliente. Un pedido puede llevar solo un nombre escrito suelto
 *   —"la señora del kiosco"— porque anotar un encargo no debería obligar
 *   a dar de alta a nadie. Una venta sí necesita una ficha de verdad, con
 *   teléfono, porque es a quien se le va a cobrar. Si el pedido traía un
 *   nombre suelto, el botón de cliente nuevo se abre con ese nombre ya
 *   puesto.
 *
 *   El monto. El pedido guarda un precio ESTIMADO, de cuando todavía no
 *   se había comprado la mercancía. Aquí se propone ese estimado por la
 *   cantidad, y se deja editar: el precio real casi nunca es el que se
 *   calculó semanas antes.
 *
 *   Las cuotas. El pedido no las tiene, y son media venta.
 *
 * Lo que sí se copia sin preguntar es la categoría —ya se eligió una vez—
 * y la nota.
 */
export function PreorderConvertDialog({
  preorder,
  clients,
  open,
  onOpenChange,
}: {
  preorder: PreorderCardData;
  clients: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [clientOptions, setClientOptions] = React.useState(clients);

  const cantidad = preorder.quantity ?? 1;
  const estimado =
    preorder.estimated_price !== null && preorder.estimated_price !== undefined
      ? Number(preorder.estimated_price) * cantidad
      : null;

  const form = useForm<ConvertValues>({
    resolver: zodResolver(convertSchema),
    defaultValues: {
      clientId: preorder.client_id ?? "",
      itemDescription:
        cantidad > 1
          ? `${preorder.product_name} (x${cantidad})`
          : preorder.product_name,
      totalAmount: estimado !== null ? String(estimado) : "",
      installmentsCount: "2",
      notes: preorder.notes ?? "",
    },
  });

  React.useEffect(() => {
    setClientOptions(clients);
  }, [clients]);

  const total = Number((form.watch("totalAmount") || "0").replace(",", "."));
  const cuotas = Number(form.watch("installmentsCount") || "0");
  const porCuota =
    Number.isFinite(total) && total > 0 && cuotas >= 1
      ? Math.round((total / cuotas + Number.EPSILON) * 100) / 100
      : null;

  async function onSubmit(values: ConvertValues) {
    setLoading(true);
    const res = await convertPreorderToSale({
      preorderId: preorder.id,
      clientId: values.clientId,
      itemDescription: values.itemDescription,
      totalAmount: Number(values.totalAmount.replace(",", ".")),
      installmentsCount: Number(values.installmentsCount),
      notes: values.notes || null,
    });
    setLoading(false);

    if (!res.success) {
      toast.error(res.error ?? "No se pudo convertir el pedido");
      return;
    }

    toast.success("El pedido ya es una venta");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-scroll">
        <DialogHeader>
          <DialogTitle>Convertir en venta</DialogTitle>
          <DialogDescription>
            El pedido queda marcado como entregado y enlazado a esta venta.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Selecciona un cliente" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clientOptions.map((c) => (
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
              {/*
                Si el pedido traía un nombre suelto, se abre con ese nombre
                ya escrito: es el caso normal y ahorra teclearlo otra vez.
              */}
              <ClientFormDialog
                compact
                defaultName={preorder.client_id ? "" : preorder.client_name_raw ?? ""}
                triggerClassName="h-11 w-full"
                onCreated={(c) => {
                  setClientOptions((prev) => [...prev, { id: c.id, name: c.name }]);
                  form.setValue("clientId", c.id, { shouldValidate: true });
                }}
              />
            </div>

            <FormField
              control={form.control}
              name="itemDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mercancía</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="totalAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto total ($)</FormLabel>
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
              <FormField
                control={form.control}
                name="installmentsCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuotas</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="36"
                        className="h-11"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {estimado !== null && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                El pedido estimaba {formatCurrency(estimado)}
                {cantidad > 1 && ` (${cantidad} × ${formatCurrency(estimado / cantidad)})`}.
                Ajusta el monto al precio real.
              </p>
            )}

            {porCuota !== null && (
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                {cuotas} {cuotas === 1 ? "cuota" : "cuotas"} de{" "}
                <span className="font-semibold">{formatCurrency(porCuota)}</span>
              </div>
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
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="h-12 w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ShoppingCart className="h-4 w-4" />
              )}
              Convertir en venta
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
