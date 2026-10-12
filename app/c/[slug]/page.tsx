import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { cache } from "react";

import { formatCurrency } from "@/lib/format";
import { BUCKET_DE_CATALOGO } from "@/lib/images";
import type { Database } from "@/types/database.types";

// Página PÚBLICA: sin sesión, cacheada por 30 s. No lee cookies (usa un
// cliente anónimo a propósito) para poder servirse rápido a quien tenga el
// enlace.
export const revalidate = 30;

interface PublicProduct {
  id: string;
  name: string;
  category: string;
  category_label: string;
  price: number | null;
  note: string | null;
  image_path: string | null;
}

interface PublicCatalog {
  business_name: string | null;
  logo_url: string | null;
  products: PublicProduct[];
}

/**
 * Lee el catálogo por su slug llamando a la función pública de la base. Va con
 * `cache()` para que `generateMetadata` y la página no la pidan dos veces en
 * el mismo render.
 */
const obtenerCatalogo = cache(
  async (slug: string): Promise<PublicCatalog | null> => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;

    const supabase = createSupabaseClient<Database>(url, key);
    const { data } = await supabase.rpc("catalogo_publico", { p_slug: slug });
    return (data as unknown as PublicCatalog | null) ?? null;
  }
);

/** Dirección pública de una foto del catálogo (el depósito es de lectura abierta). */
function urlPublica(path: string | null): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !path) return null;
  return `${url}/storage/v1/object/public/${BUCKET_DE_CATALOGO}/${path}`;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const catalogo = await obtenerCatalogo(params.slug);
  const nombre = catalogo?.business_name?.trim() || "Catálogo";
  const logo = catalogo?.logo_url ?? undefined;
  const descripcion = `Catálogo de ${nombre}`;
  return {
    title: nombre,
    description: descripcion,
    openGraph: {
      title: nombre,
      description: descripcion,
      images: logo ? [{ url: logo }] : undefined,
    },
  };
}

export default async function CatalogoPublicoPage({
  params,
}: {
  params: { slug: string };
}) {
  const catalogo = await obtenerCatalogo(params.slug);

  if (!catalogo) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 px-6 text-center dark:bg-slate-950">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Catálogo no encontrado
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Puede que el enlace sea viejo o esté incompleto.
        </p>
      </main>
    );
  }

  const nombre = catalogo.business_name?.trim() || "Catálogo";
  const logo = catalogo.logo_url;
  const productos = catalogo.products ?? [];

  // Agrupar por categoría. Ya vienen ordenados por el servidor (Calzado 1ero),
  // así que basta con cortar cada vez que cambia la etiqueta.
  const grupos: { label: string; items: PublicProduct[] }[] = [];
  for (const p of productos) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.label === p.category_label) ultimo.items.push(p);
    else grupos.push({ label: p.category_label, items: [p] });
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <header className="mb-8 flex flex-col items-center text-center">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={nombre}
            className="h-20 w-20 rounded-2xl border border-slate-200 object-cover shadow-sm dark:border-slate-800"
          />
        )}
        <h1 className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100">
          {nombre}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Catálogo de productos
        </p>
      </header>

      {productos.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Este catálogo todavía no tiene productos.
        </p>
      ) : (
        <div className="space-y-8">
          {grupos.map((g) => (
            <section key={g.label}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                {g.label}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {g.items.map((p) => {
                  const img = urlPublica(p.image_path);
                  return (
                    <div
                      key={p.id}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="aspect-square w-full bg-slate-100 dark:bg-slate-800">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img}
                            alt={p.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="space-y-0.5 p-3">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {p.name}
                        </p>
                        {p.price !== null && (
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                            {formatCurrency(Number(p.price))}
                          </p>
                        )}
                        {p.note && (
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {p.note}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <footer className="mt-10 pb-10 text-center text-xs text-slate-400 dark:text-slate-600">
        Catálogo hecho con DuoPay
      </footer>
    </main>
  );
}
