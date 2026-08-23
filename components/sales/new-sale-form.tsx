"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createSale } from "@/actions/sale-actions";
import {
  ClientPicker,
  clientSelectionError,
  type ClientSelection,
} from "@/components/clients/client-picker";
import {
  SaleItemsField,
  type SaleItemDraft,
  type StockProduct,
} from "@/components/sales/sale-items-field";
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
  firstCharge: z.enum(["ESTA", "PROXIMA"]),
  notes: z.string().optional(),
});

type SaleValues = z.infer<typeof saleSchema>;

export function NewSaleForm({
  clients,
  products,
  estaQuincena,
  proximaQuincena,
}: {
  clients: { id: string; name: string }[];
  products: StockProduct[];
  /** Etiqueta de la jornada de cobro vigente, ej. "15 de ago". */
  estaQuincena: string;
  /** Etiqueta de la siguiente, ej. "1 de sep". */
  proximaQuincena: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [client, setClient] = React.useState<ClientSelection>({ kind: "none" });
  const [showClientError, setShowClientError] = React.useState(false);
  const [items, setItems] = React.useState<SaleItemDraft[]>([]);
  // Mientras no escriba nada a mano, la descripción y la categoría se
  // arman solas con lo que elija del inventario.
  const [descTouched, setDescTouched] = React.useState(false);
  const [catTouched, setCatTouched] = React.useState(false);

  const productById = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  React.useEffect(() => {
    if (items.length === 0) return;

    if (!descTouched) {
      const texto = items
        .map((item) => {
          const product = productById.get(item.productId);
          if (!product) return null;
          return item.quantity > 1
            ? `${item.quantity} ${product.name}`
            : product.name;
        })
        .filter(Boolean)
        .join(" + ");
      if (texto) form.setValue("itemDescription", texto);
    }

    if (!catTouched) {
      const primero = productById.get(items[0].productId);
      if (primero) form.setValue("category", primero.category);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, descTouched, catTouched, productById]);

  const form = useForm<SaleValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      itemDescription: "",
      category: "ROPA",
      totalAmount: "",
      installmentsCount: "2",
      firstCharge: "PROXIMA",
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
    // El cliente es obligatorio en una venta: sin él no hay a quién cobrar.
    if (clientSelectionError(client, { required: true })) {
      setShowClientError(true);
      return;
    }

    setLoading(true);
    const res = await createSale({
      ...values,
      clientId: client.kind === "existing" ? client.id : null,
      newClient:
        client.kind === "new"
          ? { name: client.name, phone: client.phone }
          : null,
      totalAmount: Number(values.totalAmount),
      installmentsCount: Number(values.installmentsCount),
      items,
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
        <ClientPicker
          clients={clients}
          value={client}
          onChange={(v) => {
            setClient(v);
            setShowClientError(false);
          }}
          required
          showError={showClientError}
        />

        <SaleItemsField
          products={products}
          value={items}
          onChange={setItems}
        />

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
                  onChange={(e) => {
                    setDescTouched(true);
                    field.onChange(e);
                  }}
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
                <Select
                  onValueChange={(v) => {
                    setCatTouched(true);
                    field.onChange(v);
                  }}
                  value={field.value}
                >
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
                <FormLabel>N° de quincenas</FormLabel>
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
              Cada quincena pone:{" "}
              <span className="font-bold">
                {formatCurrency(installmentAmount)}
              </span>
            </span>
          </div>
        )}

        <FormField
          control={form.control}
          name="firstCharge"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Primer cobro</FormLabel>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    value: "PROXIMA" as const,
                    title: proximaQuincena,
                    hint: "La próxima quincena",
                  },
                  {
                    value: "ESTA" as const,
                    title: estaQuincena,
                    hint: "Esta misma quincena",
                  },
                ].map((option) => {
                  const active = field.value === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => field.onChange(option.value)}
                      aria-pressed={active}
                      className={
                        active
                          ? "rounded-lg border-2 border-indigo-500 bg-indigo-50 p-3 text-left dark:bg-indigo-950/40"
                          : "rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      }
                    >
                      <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {option.title}
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {option.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

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
          Registrar venta a crédito
        </Button>
      </form>
    </Form>
  );
}