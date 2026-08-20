import { Plus } from "lucide-react";
import Link from "next/link";

import { SaleList } from "@/components/sales/sale-list";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import type { SaleCardData } from "@/components/sales/sale-card";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  const supabase = createClient();

  const { data: sales } = await supabase
    .from("sales")
    .select(
      "id, item_description, category, total_amount, amount_paid, installment_amount, installments_count, status, notes, created_at, clients(name)"
    )
    .order("created_at", { ascending: false });

  const mapped: SaleCardData[] = (sales ?? []).map((s) => ({
    id: s.id,
    item_description: s.item_description,
    category: s.category,
    total_amount: Number(s.total_amount),
    amount_paid: Number(s.amount_paid),
    installment_amount: Number(s.installment_amount),
    installments_count: s.installments_count,
    status: s.status,
    notes: s.notes,
    created_at: s.created_at,
    client_name:
      (s.clients as unknown as { name: string } | null)?.name ?? "Cliente",
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Ventas a fiado
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Toca una venta para cobrar
          </p>
        </div>
        <Button asChild className="h-11">
          <Link href="/ventas/nueva">
            <Plus className="h-4 w-4" />
            Nueva
          </Link>
        </Button>
      </div>
      <SaleList sales={mapped} />
    </div>
  );
}