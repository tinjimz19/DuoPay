"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createSale } from "@/actions/sale-actions";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { Button } from "@/components/ui/button";
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
import { CATEGORY_OPTIONS } from "@/lib/labels";
import { formatCurrency } from "@/lib/format";

const saleSchema = z.object({
  clientId: z.string().min(1, "Selecciona un cliente"),
  itemDescription: z.string().min(3, "Describe la mercancía"),
  category: z.enum(["ROPA", "CALZADO", "PERFUME", "OTRO"]),
  totalAmount: z
    .string()
    .min(1, "Indica el monto total")
    .refine((v) => Number(v) > 0, "El monto debe ser mayor a 0"),
  installmentsCount: z
    .string()
    .min(1, "Indica las cuotas")
    .refine(
      (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 36,
      "Entre 1 y 36 cuotas"
    ),
  notes: z.string().optional(),
});

type SaleValues = z.infer<typeof saleSchema>;

export function NewSaleForm({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [clientOptions, setClientOptions] = React.useState(clients);
  const [loading, setLoading] = React.useState(false);

  const form = useForm<SaleValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      clientId: "",
      itemDescription: "",
      category: "ROPA",
      totalAmount: "",
      installmentsCount: "2",
      notes: "",
    },
  });

  const totalAmount = form.watch("totalAmount");
  const installmentsCount = form.watch("installmentsCount");
  const installmentAmount = React.useMemo(() => {
    const total = Number(totalAmount);
    const count = Number(installmentsCount);
    if (!Number.isFinite(total) || total <= 0 || !count || count <= 0) return null;
    return total / count;
  }, [totalAmount, installmentsCount]);

  async function onSubmit(values: SaleValues) {
    setLoading(true);
    const res = await createSale({
      ...values,
      totalAmount: Number(values.totalAmount),
      installmentsCount: Number(values.installmentsCount),
    });
    setLoading(false);

    if (!res.success) {
      toast.error(res.error ?? "Error al crear la venta");
      return;
    }

    toast.success("Venta registrada");
    router.push("/ventas");
    router.refresh();
  }

  return (
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
          <ClientFormDialog
            compact
            triggerClassName="h-11 w-full"
            onCreated={(c) => {
              setClientOptions((prev) => [...prev, { id: c.id, name: c.name }]);
              form.setValue("clientId", c.id);
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
                <Textarea
                  placeholder="Ej: Zapatos Nike Blancos Talla 40 + Perfume Carolina Herrera"
                  rows={2}
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
                <FormLabel>N° de cuotas</FormLabel>
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

        {installmentAmount !== null && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-800 dark:bg-sky-950/40">
            <span className="text-sky-700 dark:text-sky-300">
              Valor referencial por cuota:{" "}
              <span className="font-bold">
                {formatCurrency(installmentAmount)}
              </span>
            </span>
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
                <Textarea placeholder="Detalles extra" rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="h-12 w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          Registrar venta a fiado
        </Button>
      </form>
    </Form>
  );
}