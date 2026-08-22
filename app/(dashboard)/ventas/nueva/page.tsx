import { BackLink } from "@/components/back-link";
import { NewSaleForm } from "@/components/sales/new-sale-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  currentQuincena,
  nextQuincena,
  quincenaLabel,
} from "@/lib/quincenas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NuevaVentaPage() {
  const supabase = createClient();

  const [{ data: clients }, { data: products }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, category, stock")
      .is("deleted_at", null)
      .order("name"),
  ]);

  return (
    <div className="space-y-4">
      <BackLink href="/ventas" label="Ventas" />
      <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <CardHeader>
          <CardTitle>Registrar entrega a crédito</CardTitle>
          <CardDescription>
            Cada cuota es una quincena: se cobra el 15 y el 1ero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewSaleForm
            clients={clients ?? []}
            products={(products ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              category: p.category,
              stock: Number(p.stock),
            }))}
            estaQuincena={quincenaLabel(currentQuincena())}
            proximaQuincena={quincenaLabel(nextQuincena())}
          />
        </CardContent>
      </Card>
    </div>
  );
}