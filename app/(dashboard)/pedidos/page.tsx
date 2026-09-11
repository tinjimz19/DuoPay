import { PreorderFormDialog } from "@/components/preorders/preorder-form-dialog";
import { PreorderList } from "@/components/preorders/preorder-list";
import { createClient } from "@/lib/supabase/server";
import type { PreorderCardData } from "@/components/preorders/preorder-card";

export const dynamic = "force-dynamic";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: { nuevo?: string };
}) {
  const supabase = createClient();

  const [{ data: preorders }, { data: clients }] = await Promise.all([
    supabase
      .from("preorders")
      .select(
        "id, product_name, category, client_id, client_name_raw, quantity, estimated_price, status, notes, created_at, image_path, sale_id, clients(name)"
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id, name")
      .is("deleted_at", null)
      .order("name"),
  ]);

  /*
    Las direcciones de las fotos se firman aquí, en el servidor.

    El depósito es privado: no hay una dirección fija que sirva siempre.
    Se pide una firmada con vencimiento, y se piden TODAS DE UNA —con
    `createSignedUrls`, en plural— en vez de una por tarjeta: una lista de
    cuarenta pedidos serían cuarenta viajes al servidor, uno detrás de
    otro, y la página tardaría un segundo largo en aparecer.

    Una hora de validez es de sobra para mirar una lista, y es tiempo
    suficiente para que el enlace no sobreviva a la sesión.
  */
  const rutas = (preorders ?? [])
    .map((p) => p.image_path)
    .filter((r): r is string => Boolean(r));

  const firmadas = new Map<string, string>();
  if (rutas.length > 0) {
    const { data } = await supabase.storage
      .from("pedidos")
      .createSignedUrls(Array.from(new Set(rutas)), 60 * 60);
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) firmadas.set(item.path, item.signedUrl);
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
    image_url: p.image_path ? firmadas.get(p.image_path) ?? null : null,
    sale_id: p.sale_id,
  }));

  const openNew = searchParams.nuevo === "1";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Pedidos / Encargos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Para tu próxima compra de mercancía
          </p>
        </div>
        <PreorderFormDialog
          clients={clients ?? []}
          defaultOpen={openNew}
        />
      </div>
      <PreorderList preorders={mapped} clients={clients ?? []} />
    </div>
  );
}