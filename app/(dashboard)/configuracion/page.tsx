import { ChevronRight, LogOut, Trash2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/actions/auth-actions";
import { BusinessForm } from "@/components/settings/business-form";
import { LogoUploader } from "@/components/settings/logo-uploader";
import { PaymentMethodsManager } from "@/components/settings/payment-methods-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { currentAccount } from "@/lib/auth-server";
import { storePaymentMethods } from "@/lib/settings-server";

export const dynamic = "force-dynamic";

function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          {titulo}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {descripcion}
        </p>
      </div>
      {children}
    </section>
  );
}

export default async function ConfiguracionPage() {
  const [account, methods] = await Promise.all([
    currentAccount(),
    storePaymentMethods(),
  ]);

  if (!account) {
    redirect("/login");
  }

  const profile = account.profile;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Configuración
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Los datos de tu tienda
        </p>
      </div>

      <Seccion
        titulo="Tu negocio"
        descripcion="Cómo te ve el cliente cuando le escribes."
      >
        <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="space-y-5 p-4">
            <LogoUploader
              userId={account.userId}
              logoUrl={profile?.logo_url ?? null}
              businessName={profile?.business_name ?? null}
              fallbackName={profile?.full_name ?? account.email}
            />
            <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
              <BusinessForm
                fullName={profile?.full_name ?? null}
                businessName={profile?.business_name ?? null}
              />
            </div>
          </CardContent>
        </Card>
      </Seccion>

      <Seccion
        titulo="Datos de pago"
        descripcion="Cómo te pagan tus clientes. Van dentro del recordatorio de WhatsApp."
      >
        <PaymentMethodsManager methods={methods} />
      </Seccion>

      <Seccion titulo="Cuenta" descripcion={account.email}>
        <div className="space-y-2">
          <Link
            href="/papelera"
            className="flex h-12 w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Trash2 className="h-4 w-4 text-slate-400" />
            <span className="flex-1">Papelera</span>
            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          </Link>

          <Link
            href="/suscripcion"
            className="flex h-12 w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span className="flex-1">Suscripción</span>
            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          </Link>

          <form action={signOut}>
            <Button
              type="submit"
              variant="outline"
              className="h-12 w-full text-slate-600 dark:text-slate-300"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </form>
        </div>
      </Seccion>
    </div>
  );
}
