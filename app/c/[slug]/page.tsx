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

/** El WhatsApp de la tienda para recibir pedidos (solo dígitos, como quiere wa.me). */
const WHATSAPP = "584128601408";

/** Un enlace de WhatsApp con el mensaje ya escrito. */
function waLink(texto: string): string {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.04 2.01c-5.52 0-9.99 4.47-9.99 9.99 0 1.76.46 3.45 1.33 4.95L2 22l5.2-1.36c1.45.79 3.08 1.21 4.84 1.21 5.52 0 9.99-4.47 9.99-9.99s-4.47-9.99-9.99-9.99zm0 18.3c-1.56 0-3.08-.42-4.4-1.2l-.32-.19-3.08.81.82-3-.2-.33a8.3 8.3 0 0 1-1.27-4.41c0-4.59 3.73-8.32 8.32-8.32 2.22 0 4.31.87 5.88 2.44a8.25 8.25 0 0 1 2.44 5.88c0 4.59-3.73 8.31-8.31 8.31zm4.56-6.23c-.25-.12-1.48-.73-1.71-.81-.23-.08-.4-.12-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43l-.48-.01c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.48-.6 1.69-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z" />
    </svg>
  );
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
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 px-4 pb-28 pt-8 dark:bg-slate-950">
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
                        <a
                          href={waLink(
                            `Hola, me interesa este producto del catálogo: ${p.name}` +
                              (p.price !== null
                                ? ` — ${formatCurrency(Number(p.price))}`
                                : "")
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 flex items-center justify-center gap-1 rounded-md bg-[#25D366] py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5" />
                          Pedir
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <a
        href={waLink("Hola, vi tu catálogo y quiero hacer un pedido.")}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed inset-x-0 bottom-0 z-50 mx-auto mb-[max(0.75rem,env(safe-area-inset-bottom))] flex w-max items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-90"
      >
        <WhatsAppIcon className="h-5 w-5" />
        Pedir por WhatsApp
      </a>

      <footer className="mt-10 pb-10 text-center text-xs text-slate-400 dark:text-slate-600">
        Catálogo hecho con DuoPay
      </footer>
    </main>
  );
}
