import {
  CategoriesManager,
  type CategoryWithUsage,
} from "@/components/admin/categories-manager";
import { allCategories } from "@/lib/categories-server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  const supabase = createClient();

  const [categories, { data: usage }] = await Promise.all([
    allCategories(),
    // El super admin no tiene RLS para leer las ventas de las tiendas, así
    // que el conteo viene de una función SECURITY DEFINER (ver patch-05).
    supabase.rpc("category_usage"),
  ]);

  const usoPorSlug = new Map<string, number>();
  for (const row of (usage ?? []) as {
    slug: string;
    ventas: number;
    pedidos: number;
    productos: number;
  }[]) {
    usoPorSlug.set(
      row.slug,
      Number(row.ventas) + Number(row.pedidos) + Number(row.productos)
    );
  }

  const conUso: CategoryWithUsage[] = categories.map((c) => ({
    ...c,
    usage: usoPorSlug.get(c.slug) ?? 0,
  }));

  const activas = conUso.filter((c) => c.is_active).length;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Categorías
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {activas} disponible{activas === 1 ? "" : "s"} para todas las tiendas
          {conUso.length !== activas && ` · ${conUso.length - activas} apagada${conUso.length - activas === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
        El orden de aquí es el orden en que las tiendas las ven al registrar
        una venta. Apagar una la saca de esa lista sin tocar lo ya vendido.
      </div>

      <CategoriesManager categories={conUso} />
    </div>
  );
}
