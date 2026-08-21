import { ReceiptText } from "lucide-react";

import { PaymentReportCard } from "@/components/admin/payment-report-card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPagosPage() {
  const supabase = createClient();

  const { data: reports } = await supabase
    .from("payment_reports")
    .select(
      "id, user_id, amount, method, reference, proof_path, notes, status, created_at, reviewed_at, profiles(business_name, full_name)"
    )
    .order("created_at", { ascending: false });

  const proofPaths = (reports ?? [])
    .map((r) => r.proof_path)
    .filter((p): p is string => !!p);

  const signedUrls = new Map<string, string>();
  await Promise.all(
    Array.from(new Set(proofPaths)).map(async (path) => {
      const { data } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(path, 60 * 60);
      if (data?.signedUrl) signedUrls.set(path, data.signedUrl);
    })
  );

  const enriched = (reports ?? []).map((report) => {
    const profile = Array.isArray(report.profiles)
      ? report.profiles[0]
      : report.profiles;
    return {
      id: report.id,
      amount: report.amount,
      method: report.method,
      reference: report.reference,
      proof_path: report.proof_path,
      notes: report.notes,
      status: report.status,
      created_at: report.created_at,
      reviewed_at: report.reviewed_at,
      store_name:
        profile?.business_name || profile?.full_name || "Tienda sin nombre",
      proofUrl: report.proof_path
        ? signedUrls.get(report.proof_path) ?? null
        : null,
    };
  });

  const pending = enriched.filter((r) => r.status === "PENDING");
  const reviewed = enriched.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Reportes de pago
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {pending.length} pendiente{pending.length === 1 ? "" : "s"} de revisar
        </p>
      </div>

      {enriched.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <ReceiptText className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aún no hay reportes de pago.
          </p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Pendientes
              </h2>
              {pending.map((report) => (
                <PaymentReportCard key={report.id} report={report} />
              ))}
            </section>
          )}

          {reviewed.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Revisados
              </h2>
              {reviewed.map((report) => (
                <PaymentReportCard key={report.id} report={report} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
