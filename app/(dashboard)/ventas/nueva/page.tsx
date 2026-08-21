import { BackLink } from "@/components/back-link";
import { NewSaleForm } from "@/components/sales/new-sale-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NuevaVentaPage() {
  const supabase = createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .is("deleted_at", null)
    .order("name");

  return (
    <div className="space-y-4">
      <BackLink href="/ventas" label="Ventas" />
      <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <CardHeader>
          <CardTitle>Registrar entrega a fiado</CardTitle>
          <CardDescription>
            La venta queda por cobrar en cuotas configurables.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewSaleForm clients={clients ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}