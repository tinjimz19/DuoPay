import { Building2, CircleDollarSign, Clock3, Users, XCircle } from "lucide-react";
import Link from "next/link";

import { getStores } from "@/lib/admin-data";
import { getEffectiveStatus } from "@/lib/subscription";

export const dynamic = "force-dynamic";

const PRICE_PER_STORE = 10;

export default async function AdminPage() {
  const stores = await getStores();
  const owners = stores.filter((s) => s.role !== "super_admin");

  const byStatus = { TRIAL: 0, ACTIVE: 0, EXPIRED: 0, SUSPENDED: 0 } as Record<
    string,
    number
  >;
  for (const store of owners) {
    byStatus[getEffectiveStatus(store)] += 1;
  }

  const kpis = [
    {
      label: "Tiendas",
      value: owners.length,
      icon: Building2,
      tone: "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/50",
    },
    {
      label: "Activas",
      value: byStatus.ACTIVE,
      icon: CircleDollarSign,
      tone: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50",
    },
    {
      label: "En prueba",
      value: byStatus.TRIAL,
      icon: Clock3,
      tone: "text-sky-600 bg-sky-50 dark:text-sky-400 dark:bg-sky-950/50",
    },
    {
      label: "Vencidas / suspendidas",
      value: byStatus.EXPIRED + byStatus.SUSPENDED,
      icon: XCircle,
      tone: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/50",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Resumen
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Suscripciones de DuoPay · ${PRICE_PER_STORE}/mes por tienda
        </p>
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/40">
        <p className="text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          Ingreso mensual estimado
        </p>
        <p className="mt-1 text-3xl font-bold text-emerald-700 dark:text-emerald-300">
          ${(byStatus.ACTIVE * PRICE_PER_STORE).toFixed(0)}
          <span className="text-sm font-medium text-emerald-600/70 dark:text-emerald-400/70">
            {" "}
            / mes
          </span>
        </p>
        <p className="mt-1 text-xs text-emerald-600/80 dark:text-emerald-400/80">
          {byStatus.ACTIVE} tienda{byStatus.ACTIVE === 1 ? "" : "s"} activa
          {byStatus.ACTIVE === 1 ? "" : "s"} × ${PRICE_PER_STORE}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div
                className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${kpi.tone}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {kpi.value}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {kpi.label}
              </p>
            </div>
          );
        })}
      </div>

      <Link
        href="/admin/tiendas"
        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-100">
              Gestionar tiendas
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Activar, renovar o suspender suscripciones
            </p>
          </div>
        </div>
        <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
          Ver →
        </span>
      </Link>
    </div>
  );
}
