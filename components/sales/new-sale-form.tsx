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
  PrimerCobroField,
  type PrimerCobroValue,
} from "@/components/sales/primer-cobro-field";
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
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCategories } from "@/components/categories-provider";
import { parseMoney } from "@/lib/money";
import type { FirstChargeOption } from "@/lib/quincenas";
import { formatCurrency } from "@/lib/format";

const saleSchema = z.object({
  itemDescription: z.string().min(3, "Describe la mercancía"),
  category: z.string().min(2, "Elige una categoría"),
  totalAmount: z
    .string()
    .min(1, "Indica el monto total")
    .refine((v) => parseMoney(v) > 0, "El monto debe ser mayor a 0"),
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

export function NewSaleForm({
  clients,
  products,
  firstChargeOptions,
}: {
  clients: { id: string; name: string }[];
  products: StockProduct[];
  /** Jornadas de cobro entre las que puede arrancar la venta. */
  firstChargeOptions: FirstChargeOption[];
}) {
  const router = useRouter();
  const categorias = useCategories();
  const [loading, setLoading] = React.useState(false);
  const [client, setClient] = React.useState<ClientSelection>({ kind: "none" });
  const [showClientError, setShowClientError] = React.useState(false);
  const [items, setItems] = React.useState<SaleItemDraft[]>([]);
  /*
    Desde cuándo se cobra. Vive fuera del formulario porque son dos datos
    que viajan juntos y uno anula al otro: o una quincena, o un día suelto.
    Meterlos como dos campos sueltos de react-hook-form deja estados
    imposibles —quincena Y fecha a la vez— que después hay que desenredar.
  */
  const [primerCobro, setPrimerCobro] = React.useState<PrimerCobroValue>({
    offset: 1,
    fecha: null,
  });
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
      // La primera del catálogo, sea cual sea hoy.
      category: categorias.selectable[0]?.slug ?? "OTRO",
      totalAmount: "",
      installmentsCount: "2",
      notes: "",
    },
  });

  const totalAmount = form.watch("totalAmount");
  const installmentsCount = form.watch("installmentsCount");
  const installmentAmount = React.useMemo(() => {
    const total = parseMoney(totalAmount);
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
      totalAmount: parseMoney(values.totalAmount),
      installmentsCount: Number(values.installmentsCount),
      firstChargeOffset: primerCobro.offset,
      // La fecha suelta solo vale con una cuota; el servidor la ignora
      // igual, pero no mandarla evita que quede guardada por accidente.
      firstChargeDate:
        Number(values.installmentsCount) === 1 ? primerCobro.fecha : null,
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

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="totalAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monto total (€)</FormLabel>
                <FormControl>
                  <MoneyInput
                    className="h-11"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value}
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

        <PrimerCobroField
          options={firstChargeOptions}
          value={primerCobro}
          onChange={setPrimerCobro}
          permiteFechaSuelta={Number(form.watch("installmentsCount")) === 1}
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