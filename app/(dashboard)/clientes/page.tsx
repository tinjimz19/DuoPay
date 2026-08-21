import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { ClientList } from "@/components/clients/client-list";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const supabase = createClient();

  const [{ data: clients }, { data: sales }, { data: profile }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name, phone, notes")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("sales")
        .select("client_id, total_amount, amount_paid, status")
        .is("deleted_at", null),
      supabase.from("profiles").select("business_name").maybeSingle(),
    ]);

  const balances = new Map<string, number>();
  for (const sale of sales ?? []) {
    if (sale.status === "COMPLETED") continue;
    const remaining =
      Number(sale.total_amount) - Number(sale.amount_paid);
    balances.set(
      sale.client_id,
      (balances.get(sale.client_id) ?? 0) + remaining
    );
  }

  const enriched = (clients ?? []).map((c) => ({
    ...c,
    balance: balances.get(c.id) ?? 0,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Clientes
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {enriched.length} cliente{enriched.length === 1 ? "" : "s"}
          </p>
        </div>
        <ClientFormDialog />
      </div>
      <ClientList clients={enriched} businessName={profile?.business_name ?? null} />
    </div>
  );
}