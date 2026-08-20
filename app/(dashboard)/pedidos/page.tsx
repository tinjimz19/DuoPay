import { PreorderFormDialog } from "@/components/preorders/preorder-form-dialog";
import { PreorderList } from "@/components/preorders/preorder-list";
import { createClient } from "@/lib/supabase/server";
import type { PreorderCardData } from "@/components/preorders/preorder-card";

export const dynamic = "force-dynamic";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: { nuevo?: string };
}) {
  const supabase = createClient();

  const [{ data: preorders }, { data: clients }] = await Promise.all([
    supabase
      .from("preorders")
      .select(
        "id, product_name, category, client_id, client_name_raw, quantity, estimated_price, status, notes, created_at, clients(name)"
      )
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const mapped: PreorderCardData[] = (preorders ?? []).map((p) => ({
    id: p.id,
    product_name: p.product_name,
    category: p.category,
    client_id: p.client_id,
    client_name_raw: p.client_name_raw,
    client_name:
      (p.clients as unknown as { name: string } | null)?.name ?? null,
    quantity: p.quantity,
    estimated_price:
      p.estimated_price !== null ? Number(p.estimated_price) : null,
    status: p.status,
    notes: p.notes,
    created_at: p.created_at,
  }));

  const openNew = searchParams.nuevo === "1";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Pedidos / Encargos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Para tu próxima compra de mercancía
          </p>
        </div>
        <PreorderFormDialog
          clients={clients ?? []}
          defaultOpen={openNew}
        />
      </div>
      <PreorderList preorders={mapped} clients={clients ?? []} />
    </div>
  );
}