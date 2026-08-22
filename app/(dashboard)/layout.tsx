import { redirect } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { Header } from "@/components/navigation/header";
import { Sidebar } from "@/components/navigation/sidebar";
import { SetupNotice } from "@/components/setup-notice";
import type { SubscriptionTone } from "@/components/subscription/subscription-badge";
import { formatDateShort } from "@/lib/format";
import { daysLeft, getEffectiveStatus } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return <SetupNotice />;
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, business_name, role, status, trial_ends_at, subscription_ends_at")
    .eq("id", user.id)
    .maybeSingle();

  // Estado de la suscripción, que se muestra como insignia junto al nombre
  // del negocio. No aplica al super admin.
  const effective = profile ? getEffectiveStatus(profile) : null;
  const cutoffDate =
    effective === "TRIAL"
      ? profile?.trial_ends_at
      : effective === "ACTIVE"
        ? profile?.subscription_ends_at
        : null;
  const remaining = daysLeft(cutoffDate ?? null);
  const showCutoff =
    !!profile &&
    profile.role !== "super_admin" &&
    (effective === "TRIAL" || effective === "ACTIVE") &&
    !!cutoffDate;

  let tone: SubscriptionTone = "ok";
  if (remaining !== null && remaining <= 3) tone = "urgente";
  else if (remaining !== null && remaining <= 7) tone = "pronto";

  const subscription = showCutoff
    ? {
        label: `${effective === "TRIAL" ? "Prueba" : "Suscripción"} hasta ${formatDateShort(cutoffDate!)}`,
        tone,
      }
    : null;

  return (
    <div className="app-shell flex flex-col bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex flex-1 flex-col md:pl-64">
        <Header
          email={user.email ?? ""}
          fullName={profile?.full_name ?? null}
          businessName={profile?.business_name ?? null}
          subscription={subscription}
        />
        <main className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-4 sm:max-w-3xl lg:max-w-5xl">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}