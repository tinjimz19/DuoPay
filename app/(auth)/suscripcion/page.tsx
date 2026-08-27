import { CreditCard, LogOut, MessageCircle } from "lucide-react";
import { redirect } from "next/navigation";

import { signOut } from "@/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { ReportPaymentDialog } from "@/components/subscription/report-payment-dialog";
import { currentAccount, LOGIN_SESION_VENCIDA } from "@/lib/auth-server";
import { getEffectiveStatus } from "@/lib/subscription";
import type { ProfileStatus } from "@/types/database.types";

export const dynamic = "force-dynamic";

const REASONS: Record<ProfileStatus, { title: string; message: string }> = {
  TRIAL: {
    title: "Tu prueba gratuita terminó",
    message:
      "Los 3 días de prueba han finalizado. Activa tu suscripción para seguir gestionando tus ventas a crédito.",
  },
  ACTIVE: {
    title: "Suscripción vencida",
    message:
      "Tu suscripción mensual expiró. Renueva por solo $10 al mes para recuperar el acceso.",
  },
  SUSPENDED: {
    title: "Cuenta suspendida",
    message:
      "Tu tienda fue suspendida. Contáctanos para resolverlo y reactivar tu cuenta.",
  },
  EXPIRED: {
    title: "Suscripción inactiva",
    message:
      "Tu tienda no tiene una suscripción activa. Actívala por $10 al mes para continuar.",
  },
};

export default async function SuscripcionPage() {
  const account = await currentAccount();

  if (!account) {
    redirect(LOGIN_SESION_VENCIDA);
  }

  if (account.profile?.role === "super_admin") {
    redirect("/admin");
  }

  // La puerta inversa de la del dashboard: si ya tiene acceso, no pinta nada
  // que esté aquí. Antes lo decidía el middleware.
  const effective = account.profile
    ? getEffectiveStatus(account.profile)
    : "EXPIRED";

  if (!account.profile || effective === "TRIAL" || effective === "ACTIVE") {
    redirect("/");
  }

  const status: ProfileStatus = effective;

  const reason = REASONS[status];
  const whatsappNumber = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP ?? "";
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/[^\d]/g, "")}?text=${encodeURIComponent(
        "Hola, quiero activar mi suscripción de DuoPay ($10/mes)"
      )}`
    : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/50">
        <CreditCard className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
      </div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
        {reason.title}
      </h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {reason.message}
      </p>

      <div className="my-5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
        <p className="text-xs uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
          Plan DuoPay
        </p>
        <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">
          $10<span className="text-sm font-medium text-slate-500 dark:text-slate-400">/mes</span>
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Clientes, ventas a crédito, abonos y pedidos ilimitados
        </p>
      </div>

      {whatsappHref && (
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
          <Button className="h-12 w-full text-sm">
            <MessageCircle />
            Pagar por WhatsApp
          </Button>
        </a>
      )}

      <ReportPaymentDialog
        triggerLabel="Ya pagué · Reportar pago"
        triggerVariant={whatsappHref ? "outline" : "default"}
        triggerClassName="h-12 w-full text-sm"
      />

      <form action={signOut} className="mt-3">
        <Button type="submit" variant="ghost" className="h-11 w-full text-sm">
          <LogOut />
          Cerrar sesión
        </Button>
      </form>
    </div>
  );
}
