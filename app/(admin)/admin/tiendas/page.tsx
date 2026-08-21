import { Search } from "lucide-react";

import { StoreCard } from "@/components/admin/store-card";
import { getStores } from "@/lib/admin-data";
import { getEffectiveStatus } from "@/lib/subscription";
import type { ProfileStatus } from "@/types/database.types";

export const dynamic = "force-dynamic";

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "TRIAL", label: "Prueba" },
  { value: "ACTIVE", label: "Activas" },
  { value: "EXPIRED", label: "Vencidas" },
  { value: "SUSPENDED", label: "Suspendidas" },
];

export default async function TiendasPage({
  searchParams,
}: {
  searchParams?: { estado?: string; q?: string };
}) {
  const statusFilter = (searchParams?.estado ?? "") as ProfileStatus | "";
  const query = (searchParams?.q ?? "").trim().toLowerCase();

  const stores = await getStores();
  const owners = stores.filter((s) => s.role === "owner");

  const filtered = owners.filter((store) => {
    const effective = getEffectiveStatus(store);
    if (statusFilter && effective !== statusFilter) return false;
    if (query) {
      const haystack =
        `${store.business_name ?? ""} ${store.full_name ?? ""} ${store.email ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Tiendas
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {filtered.length} de {owners.length} tienda{owners.length === 1 ? "" : "s"}
        </p>
      </div>

      <form className="relative" action="/admin/tiendas">
        {statusFilter && (
          <input type="hidden" name="estado" value={statusFilter} />
        )}
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Buscar por nombre o email..."
          className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        />
      </form>

      <div className="-mx-4 overflow-x-auto px-4 pb-1">
        <div className="flex w-max gap-2">
          {FILTERS.map((filter) => {
            const active = statusFilter === filter.value;
            const href = filter.value
              ? `/admin/tiendas?estado=${filter.value}`
              : "/admin/tiendas";
            return (
              <a
                key={filter.label}
                href={href}
                className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                {filter.label}
              </a>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No hay tiendas con estos filtros.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
        </div>
      )}
    </div>
  );
}
