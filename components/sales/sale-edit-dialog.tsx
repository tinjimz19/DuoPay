"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { updateSale } from "@/actions/sale-actions";
import { useCategories } from "@/components/categories-provider";
import {
  PrimerCobroField,
  type PrimerCobroValue,
} from "@/components/sales/primer-cobro-field";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { moneyInputValue, parseMoney } from "@/lib/money";
import {
  currentQuincena,
  quincenaFromChargeDate,
  type FirstChargeOption,
} from "@/lib/quincenas";

const editSchema = z.object({
  itemDescription: z.string().min(3, "Describe la mercancía").max(300),
  category: z.string().min(2, "Elige una categoría"),
  totalAmount: z
    .string()
    .min(1, "Indica el monto total")
    .refine((v) => parseMoney(v) > 0, "El monto debe ser mayor a 0"),
  installmentsCount: z
    .string()
    .refine(
      (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 36,
      "Entre 1 y 36 cuotas"
    ),
  notes: z.string().optional(),
});

type EditValues = z.infer<typeof editSchema>;

export interface SaleToEdit {
  id: string;
  item_description: string;
  category: string;
  total_amount: number;
  installments_count: number;
  amount_paid: number;
  first_charge_date: string | null;
  notes: string | null;
}

/**
 * Editar una venta ya registrada.
 *
 * Lo que NO está aquí, y es a propósito: el cliente y los productos del
 * inventario. Cambiar el cliente arrastraría también sus abonos y dejaría dos
 * historiales mintiendo; deshacer el movimiento de stock es otra
 * funcionalidad. Para cualquiera de las dos, lo correcto es anular la venta y
 * rehacerla.
 */
export function SaleEditDialog({
  sale,
  firstChargeOptions,
  open,
  onOpenChange,
}: {
  sale: SaleToEdit;
  firstChargeOptions: FirstChargeOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const categorias = useCategories();
  const [loading, setLoading] = React.useState(false);
  const [aviso, setAviso] = React.useState<{ texto: string; aFavor: number } | null>(
    null
  );

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      itemDescription: sale.item_description,
      category: sale.category,
      totalAmount: moneyInputValue(sale.total_amount),
      installmentsCount: String(sale.installments_count),
      notes: sale.notes ?? "",
    },
  });

  const cuotas = Number(form.watch("installmentsCount") || "0");
  const unaSolaCuota = cuotas === 1;

  const [primerCobro, setPrimerCobro] = React.useState<PrimerCobroValue>(() =>
    primerCobroInicial(sale, firstChargeOptions)
  );

  const total = parseMoney(form.watch("totalAmount") || "");
  const porCuota =
    Number.isFinite(total) && total > 0 && cuotas >= 1 && cuotas <= 36
      ? Math.round((total / cuotas + Number.EPSILON) * 100) / 100
      : null;

  async function guardar(values: EditValues, confirmado: boolean) {
    setLoading(true);
    const res = await updateSale({
      id: sale.id,
      itemDescription: values.itemDescription,
      category: values.category,
      totalAmount: parseMoney(values.totalAmount),
      installmentsCount: Number(values.installmentsCount),
      firstChargeOffset: primerCobro.offset,
      firstChargeDate: unaSolaCuota ? primerCobro.fecha : null,
      notes: values.notes || null,
      confirmarSaldoAFavor: confirmado,
    });
    setLoading(false);

    if (!res.success) {
      // Primera negativa por saldo a favor: no es un error, es una pregunta.
      if (res.needsConfirm) {
        setAviso({ texto: res.error, aFavor: res.aFavor ?? 0 });
        return;
      }
      toast.error(res.error);
      return;
    }

    toast.success("Venta actualizada");
    setAviso(null);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setAviso(null);
        onOpenChange(v);
      }}
    >
      <DialogContent className="dialog-scroll">
        <DialogHeader>
          <DialogTitle>Editar venta</DialogTitle>
          <DialogDescription>
            {sale.amount_paid > 0
              ? `Este cliente ya abonó ${formatCurrency(Number(sale.amount_paid))}. Los abonos no se tocan.`
              : "Todavía no tiene abonos registrados."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => guardar(v, false))}
            className="space-y-4"
          >
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
                        value={field.value ?? ""}
                        onChange={(v) => {
                          setAviso(null);
                          field.onChange(v);
                        }}
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

            {porCuota !== null && (
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                {cuotas} {cuotas === 1 ? "cuota" : "cuotas"} de{" "}
                <span className="font-semibold">{formatCurrency(porCuota)}</span>
              </div>
            )}

            <PrimerCobroField
              options={firstChargeOptions}
              value={primerCobro}
              onChange={setPrimerCobro}
              permiteFechaSuelta={unaSolaCuota}
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
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {aviso ? (
              <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {aviso.texto} Los abonos no se borran; el cliente quedaría
                    con {formatCurrency(aviso.aFavor)} a favor.
                  </span>
                </p>
                <Button
                  type="button"
                  className="h-11 w-full"
                  disabled={loading}
                  onClick={() => guardar(form.getValues(), true)}
                >
                  {loading && <Loader2 className="animate-spin" />}
                  Guardar de todos modos
                </Button>
              </div>
            ) : (
              <Button type="submit" className="h-12 w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar cambios
              </Button>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Con qué queda seleccionado el control al abrir.
 *
 * Si la venta es de una cuota y su día no cae en ninguna de las quincenas
 * ofrecidas, se abre en "otra fecha" con ese día puesto: así la tienda ve lo
 * que pactó y no una quincena que nunca eligió.
 */
function primerCobroInicial(
  sale: SaleToEdit,
  options: FirstChargeOption[]
): PrimerCobroValue {
  if (!sale.first_charge_date) return { offset: 1, fecha: null };

  const dia = sale.first_charge_date.slice(0, 10);
  const offset = quincenaFromChargeDate(dia) - currentQuincena();
  const esUnaDeLasOfrecidas = options.some((o) => o.offset === offset);

  if (sale.installments_count === 1) {
    const cae1o15 = dia.endsWith("-01") || dia.endsWith("-15");
    if (!cae1o15 || !esUnaDeLasOfrecidas) {
      return { offset: esUnaDeLasOfrecidas ? offset : 0, fecha: dia };
    }
  }

  // Una quincena que ya pasó no está entre las opciones: se cae a la primera
  // que sí se ofrece, para no dejar el control sin nada marcado.
  return { offset: esUnaDeLasOfrecidas ? offset : 0, fecha: null };
}
