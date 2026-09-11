"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { convertPreorderToSale } from "@/actions/preorder-actions";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { moneyInputValue, parseMoney } from "@/lib/money";
import type { PreorderCardData } from "@/components/preorders/preorder-card";

const convertSchema = z.object({
  itemDescription: z.string().min(3, "Describe la mercancía").max(300),
  totalAmount: z
    .string()
    .min(1, "Escribe el monto")
    .refine((v) => parseMoney(v) > 0, "El monto debe ser mayor a 0"),
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
 * Un pedido y una venta no guardan lo mismo, así que convertir no es copiar:
 * hay tres huecos que el pedido no tiene y la venta necesita.
 *
 *   El cliente. Un pedido se puede anotar sin cliente —"la señora del
 *   kiosco quiere un perfume"— porque obligar a darla de alta para anotar
 *   un encargo que quizá no compre llenaría la lista de gente que no es
 *   cliente. Una venta sí necesita ficha, con teléfono, porque es a quien
 *   se le va a cobrar. Aquí es obligatorio, y se puede crear en el momento.
 *
 *   El monto. El pedido guarda un precio ESTIMADO, de cuando todavía no se
 *   había comprado la mercancía. Se propone ese estimado por la cantidad y
 *   se deja editar: el precio real casi nunca es el que se calculó semanas
 *   antes.
 *
 *   Las cuotas. El pedido no las tiene, y son media venta.
 *
 * Lo que sí se copia sin preguntar es la categoría —ya se eligió una vez— y
 * la nota.
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
  const [showClientError, setShowClientError] = React.useState(false);

  /*
    Si el pedido ya tiene cliente, viene elegido. Si solo traía un nombre
    suelto —los pedidos viejos lo permitían— se abre el alta con ese nombre
    ya escrito, que es el caso en el que más se agradece.
  */
  const [client, setClient] = React.useState<ClientSelection>(
    preorder.client_id
      ? { kind: "existing", id: preorder.client_id }
      : preorder.client_name_raw
        ? { kind: "new", name: preorder.client_name_raw, phone: "" }
        : { kind: "none" }
  );

  const cantidad = preorder.quantity ?? 1;
  const estimado =
    preorder.estimated_price !== null && preorder.estimated_price !== undefined
      ? Number(preorder.estimated_price) * cantidad
      : null;

  const form = useForm<ConvertValues>({
    resolver: zodResolver(convertSchema),
    defaultValues: {
      itemDescription:
        cantidad > 1
          ? `${preorder.product_name} (x${cantidad})`
          : preorder.product_name,
      totalAmount: estimado !== null ? moneyInputValue(estimado) : "",
      installmentsCount: "2",
      notes: preorder.notes ?? "",
    },
  });

  // La cuota, mientras se escribe. Es el número que la tienda le va a decir
  // al cliente, así que verlo antes de guardar evita tener que rehacer la
  // venta porque no cuadraba.
  const total = parseMoney(form.watch("totalAmount") || "");
  const cuotas = Number(form.watch("installmentsCount") || "0");
  const porCuota =
    Number.isFinite(total) && total > 0 && cuotas >= 1 && cuotas <= 36
      ? Math.round((total / cuotas + Number.EPSILON) * 100) / 100
      : null;

  async function onSubmit(values: ConvertValues) {
    if (clientSelectionError(client, { required: true })) {
      setShowClientError(true);
      return;
    }

    setLoading(true);
    const res = await convertPreorderToSale({
      preorderId: preorder.id,
      clientId: client.kind === "existing" ? client.id : null,
      newClient:
        client.kind === "new"
          ? { name: client.name, phone: client.phone }
          : null,
      itemDescription: values.itemDescription,
      totalAmount: parseMoney(values.totalAmount),
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
            El pedido queda entregado y enlazado a esta venta.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ClientPicker
              clients={clients}
              value={client}
              required
              onChange={(v) => {
                setClient(v);
                setShowClientError(false);
              }}
              showError={showClientError}
            />

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
                El pedido estimaba {formatCurrency(estimado)}. Ajusta el monto
                al precio real.
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
