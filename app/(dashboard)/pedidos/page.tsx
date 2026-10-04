import { PreorderList } from "@/components/preorders/preorder-list";
import { bucketYRutaDeImagen } from "@/lib/images";
import { createClient } from "@/lib/supabase/server";
import type { PreorderCardData } from "@/components/preorders/preorder-card";

export const dynamic = "force-dynamic";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: { nuevo?: string };
}) {
  const supabase = createClient();

  const [{ data: preorders }, { data: clients }, { data: trips }] =
    await Promise.all([
      supabase
        .from("preorders")
        .select(
          "id, product_name, category, client_id, client_name_raw, quantity, estimated_price, status, notes, created_at, image_path, sale_id, trip_id, clients(name), trips(travel_date)"
        )
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

  /*
    Las direcciones de las fotos se firman aquí, en el servidor.

    El depósito es privado: no hay una dirección fija que sirva siempre. Se
    piden firmadas y con vencimiento, y se piden TODAS DE UNA —`createSignedUrls`,
    en plural— en vez de una por tarjeta: cuarenta pedidos serían cuarenta
    viajes en fila y la página tardaría un segundo largo en aparecer.
  */
  const refs = Array.from(
    new Set(
      (preorders ?? [])
        .map((p) => p.image_path)
        .filter((r): r is string => Boolean(r))
    )
  );

  // `firmadas` queda indexado por el `image_path` guardado (la ref), que es lo
  // que se compara abajo. Un pedido normal firma desde "pedidos"; uno que
  // reusa la foto del catálogo, desde "catalogo". Se agrupan por depósito y se
  // firman todas de una por depósito.
  const firmadas = new Map<string, string>();
  if (refs.length > 0) {
    const porBucket = new Map<string, string[]>();
    const refPorRuta = new Map<string, string>();
    for (const ref of refs) {
      const { bucket, path } = bucketYRutaDeImagen(ref);
      const lista = porBucket.get(bucket) ?? [];
      lista.push(path);
      porBucket.set(bucket, lista);
      refPorRuta.set(`${bucket}|${path}`, ref);
    }
    for (const [bucket, paths] of Array.from(porBucket.entries())) {
      const { data: urls } = await supabase.storage
        .from(bucket)
        .createSignedUrls(Array.from(new Set(paths)), 60 * 60);
      for (const item of urls ?? []) {
        if (item.path && item.signedUrl) {
          const ref = refPorRuta.get(`${bucket}|${item.path}`);
          if (ref) firmadas.set(ref, item.signedUrl);
        }
      }
    }
  }

  const mapped: PreorderCardData[] = (preorders ?? []).map((p) => ({
    id: p.id,
    product_name: p.product_name,
    category: p.category,
    client_id: p.client_id,
    client_name_raw: p.client_name_raw,
    client_name:
      (p.clients as unknown as { name: string } | null)?.name ?? null,
    quantity: p.quantity,
    estimated_price:
      p.estimated_price !== null ? Number(p.estimated_price) : null,
    status: p.status,
    notes: p.notes,
    created_at: p.created_at,
    image_path: p.image_path,
    image_url: p.image_path ? (firmadas.get(p.image_path) ?? null) : null,
    sale_id: p.sale_id,
    trip_id: p.trip_id,
    trip_date:
      (p.trips as unknown as { travel_date: string } | null)?.travel_date ??
      null,
  }));

  const openNew = searchParams.nuevo === "1";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Pedidos / Encargos
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Para tu próxima compra de mercancía
        </p>
      </div>
      <PreorderList
        preorders={mapped}
        clients={clients ?? []}
        trips={trips ?? []}
        openNew={openNew}
      />
    </div>
  );
}