import { createClient } from "@/lib/supabase/server";
import type { ProfileRole, ProfileStatus } from "@/types/database.types";

export interface StoreWithStats {
  id: string;
  full_name: string | null;
  business_name: string | null;
  email: string | null;
  role: ProfileRole;
  status: ProfileStatus;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  created_at: string;
  clients_count: number;
  sales_count: number;
  outstanding: number;
}

export async function getStores(): Promise<StoreWithStats[]> {
  const supabase = createClient();

  const [{ data: profiles }, { data: clients }, { data: sales }, { data: emails }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, business_name, role, status, trial_ends_at, subscription_ends_at, created_at"
        )
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("id, user_id").is("deleted_at", null),
      supabase
        .from("sales")
        .select("user_id, total_amount, amount_paid, status")
        .is("deleted_at", null),
      supabase.rpc("store_emails"),
    ]);

  const emailByUser = new Map<string, string | null>();
  for (const row of emails ?? []) {
    emailByUser.set(row.id, row.email);
  }

  const clientCounts = new Map<string, number>();
  for (const client of clients ?? []) {
    clientCounts.set(client.user_id, (clientCounts.get(client.user_id) ?? 0) + 1);
  }

  const salesCounts = new Map<string, number>();
  const outstandingByStore = new Map<string, number>();
  for (const sale of sales ?? []) {
    salesCounts.set(sale.user_id, (salesCounts.get(sale.user_id) ?? 0) + 1);
    if (sale.status === "COMPLETED") continue;
    const remaining = Number(sale.total_amount) - Number(sale.amount_paid);
    outstandingByStore.set(
      sale.user_id,
      (outstandingByStore.get(sale.user_id) ?? 0) + remaining
    );
  }

  return (profiles ?? []).map((profile) => ({
    ...profile,
    email: emailByUser.get(profile.id) ?? null,
    clients_count: clientCounts.get(profile.id) ?? 0,
    sales_count: salesCounts.get(profile.id) ?? 0,
    outstanding: outstandingByStore.get(profile.id) ?? 0,
  }));
}
