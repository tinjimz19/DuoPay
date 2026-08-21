import {
  HandCoins,
  PackagePlus,
  Phone,
  ReceiptText,
  MessageCircle,
} from "lucide-react";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { CategoryBadge } from "@/components/category-badge";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { PreorderStatusBadge } from "@/components/status-badge";
import { SaleCard, type SaleCardData } from "@/components/sales/sale-card";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatDateTime, normalizePhone } from "@/lib/format";
import {
  buildDebtReminderMessage,
  whatsappReminderUrl,
} from "@/lib/reminders";
import type { ProductCategory, PreorderStatus } from "@/types/database.types";

export const dynamic = "force-dynamic";

interface PaymentRow {
  id: string;
  amount: number;
  payment_number: number | null;
  notes: string | null;
  created_at: string;
}

export default async function ClienteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const [{ data: client }, { data: sales }, { data: preorders }, { data: profile }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name, phone, notes, created_at")
        .eq("id", params.id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("sales")
        .select(
          "id, item_description, category, total_amount, amount_paid, installment_amount, installments_count, status, notes, created_at, payments(id, amount, payment_number, notes, created_at)"
        )
        .eq("client_id", params.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("preorders")
        .select("*")
        .eq("client_id", params.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("business_name").maybeSingle(),
    ]);

  if (!client) {
    notFound();
  }

  const saleList = (sales ?? []) as unknown as (Omit<SaleCardData, "client_name"> & {
    payments: PaymentRow[] | null;
  })[];

  const remainingTotal = saleList.reduce((sum, s) => {
    if (s.status === "COMPLETED") return sum;
    return sum + (Number(s.total_amount) - Number(s.amount_paid));
  }, 0);

  const allPayments = saleList
    .flatMap((s) =>
      (s.payments ?? []).map((p) => ({ ...p, sale: s }))
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  const whatsappUrl = `https://wa.me/${normalizePhone(client.phone)}`;

  const openSales = saleList
    .filter((s) => s.status !== "COMPLETED")
    .map((s) => ({
      description: s.item_description,
      remaining: Number(s.total_amount) - Number(s.amount_paid),
    }));
  const reminderUrl =
    remainingTotal > 0 && openSales.length > 0
      ? whatsappReminderUrl(
          client.phone,
          buildDebtReminderMessage({
            businessName: profile?.business_name ?? null,
            clientName: client.name,
            items: openSales,
          })
        )
      : null;

  const preorderList = (preorders ?? []) as unknown as {
    id: string;
    product_name: string;
    category: ProductCategory;
    quantity: number | null;
    estimated_price: number | null;
    status: PreorderStatus;
    notes: string | null;
  }[];

  return (
    <div className="space-y-4">
      <BackLink href="/clientes" label="Clientes" />

      <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {client.name}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {client.phone} · Cliente desde{" "}
                {formatDate(client.created_at)}
              </p>
            </div>
            <ClientFormDialog client={client} />
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
            {reminderUrl && (
              <a
                href={reminderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-amber-500 px-4 text-sm font-medium text-white hover:bg-amber-600"
              >
                <HandCoins className="h-4 w-4" />
                Recordar deuda
              </a>
            )}
            <a
              href={`tel:${client.phone}`}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Phone className="h-4 w-4" />
              Llamar
            </a>
          </div>

          {client.notes && (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              {client.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <HandCoins className="h-5 w-5" />
            <span className="text-sm font-medium">Saldo por cobrar</span>
          </div>
          <p className="text-xl font-bold text-amber-700 dark:text-amber-300">
            {formatCurrency(remainingTotal)}
          </p>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Mercancía fiada ({saleList.length})
        </h2>
        {saleList.length === 0 ? (
          <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Este cliente no tiene ventas a fiado.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {saleList.map((sale) => (
              <SaleCard
                key={sale.id}
                sale={{
                  ...sale,
                  client_name: client.name,
                  payments: sale.payments ?? [],
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <ReceiptText className="h-4 w-4" />
          Historial de abonos ({allPayments.length})
        </h2>
        {allPayments.length === 0 ? (
          <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Aún no hay abonos registrados.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {allPayments.map((p) => (
              <Card
                key={p.id}
                className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {p.payment_number
                        ? `Cuota ${p.payment_number}`
                        : "Abono"}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {p.sale.item_description} · {formatDateTime(p.created_at)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(Number(p.amount))}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {preorderList.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <PackagePlus className="h-4 w-4" />
            Pedidos de este cliente ({preorderList.length})
          </h2>
          <div className="space-y-2">
            {preorderList.map((pre) => (
              <Card
                key={pre.id}
                className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <CategoryBadge category={pre.category} />
                    </div>
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {pre.product_name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Cantidad: {pre.quantity ?? 1}
                      {pre.estimated_price
                        ? ` · Est. ${formatCurrency(Number(pre.estimated_price))}`
                        : ""}
                    </p>
                  </div>
                  <PreorderStatusBadge status={pre.status} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}