import { redirect } from "next/navigation";

import { CatalogFormDialog } from "@/components/catalog/catalog-form-dialog";
import type { CatalogItem } from "@/components/catalog/catalog-card";
import { CatalogList } from "@/components/catalog/catalog-list";
import { currentAccount, LOGIN_SESION_VENCIDA } from "@/lib/auth-server";
import { puedeVerCatalogo } from "@/lib/catalog-access";
import { BUCKET_DE_CATALOGO } from "@/lib/images";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const account = await currentAccount();
  if (!account) redirect(LOGIN_SESION_VENCIDA);

  // La función es a la medida de una cuenta: quien no está autorizado ni ve
  // la página. El menú tampoco se la muestra, pero esto cierra la puerta por
  // si llega directo a la dirección.
  if (!puedeVerCatalogo(account.email)) redirect("/");

  const supabase = createClient();

  const [{ data: rows }, { data: clients }, { data: trips }] =
    await Promise.all([
      supabase
        .from("catalog_products")
        .select("id, name, category, price, note, image_path, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("clients")
        .select("id, name")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("trips")
        .select("id, travel_date")
        .order("travel_date", { ascending: true }),
    ]);

  // Las direcciones de las imágenes se firman aquí, todas de una: el depósito
  // es privado y una por tarjeta serían decenas de viajes de red.
  const rutas = (rows ?? [])
    .map((r) => r.image_path)
    .filter((r): r is string => Boolean(r));

  const firmadas = new Map<string, string>();
  if (rutas.length > 0) {
    const { data: urls } = await supabase.storage
      .from(BUCKET_DE_CATALOGO)
      .createSignedUrls(Array.from(new Set(rutas)), 60 * 60);
    for (const item of urls ?? []) {
      if (item.path && item.signedUrl) firmadas.set(item.path, item.signedUrl);
    }
  }

  const items: CatalogItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    price: r.price !== null ? Number(r.price) : null,
    note: r.note,
    image_path: r.image_path,
    image_url: r.image_path ? (firmadas.get(r.image_path) ?? null) : null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Catálogo
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tus productos para enseñar y compartir
          </p>
        </div>
        <CatalogFormDialog />
      </div>

      <CatalogList
        items={items}
        clients={clients ?? []}
        trips={trips ?? []}
      />
    </div>
  );
}
