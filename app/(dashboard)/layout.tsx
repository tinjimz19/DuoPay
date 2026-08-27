import { redirect } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { Header } from "@/components/navigation/header";
import { Sidebar } from "@/components/navigation/sidebar";
import { SetupNotice } from "@/components/setup-notice";
import type { SubscriptionTone } from "@/components/subscription/subscription-badge";
import { currentAccount } from "@/lib/auth-server";
import { formatDateShort } from "@/lib/format";
import { daysLeft, getEffectiveStatus } from "@/lib/subscription";

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

  // Una sola lectura de sesión + perfil por navegación, cacheada por React.
  const account = await currentAccount();

  if (!account) {
    redirect("/login");
  }

  const profile = account.profile;

  // El super admin solo opera su panel. Esta puerta vivía en el middleware,
  // donde costaba una consulta extra en cada request.
  if (profile?.role === "super_admin") {
    redirect("/admin");
  }

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
  // El super admin ya se fue a /admin arriba, así que aquí solo hay tiendas.
  const showCutoff =
    !!profile && (effective === "TRIAL" || effective === "ACTIVE") && !!cutoffDate;

  let tone: SubscriptionTone = "ok";
  if (remaining !== null && remaining <= 3) tone = "urgente";
  else if (remaining !== null && remaining <= 7) tone = "pronto";

  // Sin acceso, a la pantalla de suscripción. Sin perfil se deja pasar para
  // no bloquear una cuenta a medio migrar.
  const tieneAcceso =
    !profile ||
    effective === "TRIAL" ||
    effective === "ACTIVE";

  if (!tieneAcceso) {
    redirect("/suscripcion");
  }

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
          email={account.email}
          fullName={profile?.full_name ?? null}
          businessName={profile?.business_name ?? null}
          subscription={subscription}
          logoUrl={profile?.logo_url ?? null}
        />
        <main className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-4 sm:max-w-3xl lg:max-w-5xl">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}