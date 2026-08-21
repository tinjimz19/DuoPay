import { Trash2 } from "lucide-react";

import { BackLink } from "@/components/back-link";
import { TrashList } from "@/components/trash/trash-list";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PapeleraPage() {
  const supabase = createClient();

  const [{ data: clients }, { data: sales }, { data: preorders }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name, phone, deleted_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
      supabase
        .from("sales")
        .select(
          "id, item_description, total_amount, deleted_at, clients(name)"
        )
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
      supabase
        .from("preorders")
        .select("id, product_name, deleted_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
    ]);

  return (
    <div className="space-y-4">
      <BackLink href="/" label="Inicio" />
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100">
          <Trash2 className="h-5 w-5" />
          Papelera
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Restaura elementos o elimínalos definitivamente
        </p>
      </div>

      <TrashList
        clients={clients ?? []}
        sales={(sales ?? []).map((s) => ({
          id: s.id,
          item_description: s.item_description,
          client_name:
            (s.clients as unknown as { name: string } | null)?.name ?? "Cliente",
          total_amount: Number(s.total_amount),
          deleted_at: s.deleted_at,
        }))}
        preorders={preorders ?? []}
      />
    </div>
  );
}
