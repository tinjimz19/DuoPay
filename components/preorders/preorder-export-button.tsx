"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";

import { useCategories } from "@/components/categories-provider";
import type { PreorderCardData } from "@/components/preorders/preorder-card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

/**
 * Baja los pedidos PENDIENTES a un archivo de texto.
 *
 * Para qué: la lista existe para preparar la próxima compra de mercancía, y
 * eso se hace fuera de la app —con el proveedor, en la calle—. Un TXT se
 * abre en cualquier teléfono, se pega en WhatsApp y se imprime, sin depender
 * de que haya señal cuando toca comprar.
 *
 * Solo van los PENDIENTES —lo que falta por comprar—, no lo ya comprado,
 * entregado o cancelado: la lista de la compra no carga con lo que ya está
 * resuelto. Sale plano, un pedido tras otro, separados por una línea de
 * guiones.
 */

// El separador entre un pedido y el siguiente.
const SEPARADOR = "----------------------------------------";

export function PreorderExportButton({
  preorders,
}: {
  preorders: PreorderCardData[];
}) {
  const categorias = useCategories();
  const pendientes = preorders.filter((p) => p.status === "PENDENT");
  const vacio = pendientes.length === 0;

  function exportar() {
    if (vacio) return;
    const texto = construirTxt(pendientes, (slug) => categorias.label(slug));
    descargar(texto, `pedidos-pendientes-${hoyArchivo()}.txt`);
    toast.success("Pedidos pendientes exportados");
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9"
      disabled={vacio}
      onClick={exportar}
    >
      <Download className="h-4 w-4" />
      Exportar TXT
    </Button>
  );
}

/** El nombre que se le muestra a cada cliente, con los mismos respaldos que la tarjeta. */
function nombreCliente(p: PreorderCardData): string {
  return p.client_name || p.client_name_raw || "Cliente";
}

function construirTxt(
  preorders: PreorderCardData[],
  etiquetaCategoria: (slug: string | null | undefined) => string
): string {
  const lineas: string[] = [];

  lineas.push("PEDIDOS PENDIENTES");
  lineas.push(`Generado: ${formatDateTime(new Date())}`);
  lineas.push(
    `Total: ${preorders.length} ${preorders.length === 1 ? "pedido" : "pedidos"}`
  );

  preorders.forEach((p, i) => {
    lineas.push(SEPARADOR);
    lineas.push(`${i + 1}. ${p.product_name}  ·  ${etiquetaCategoria(p.category)}`);
    lineas.push(`   Cliente: ${nombreCliente(p)}`);
    lineas.push(`   Cantidad: ${p.quantity ?? 1}`);
    if (p.estimated_price !== null && p.estimated_price !== undefined) {
      lineas.push(`   Precio est.: ${formatCurrency(Number(p.estimated_price))}`);
    }
    if (p.notes && p.notes.trim()) {
      lineas.push(`   Detalles: ${p.notes.trim()}`);
    }
    lineas.push(`   Registrado: ${formatDate(p.created_at)}`);
  });

  // Un guion de cierre para que el último pedido también quede enmarcado.
  lineas.push(SEPARADOR);

  // \r\n y no \n: el Bloc de notas de Windows —donde la tienda lo va a abrir—
  // pone todo en un solo renglón si solo ve \n.
  return lineas.join("\r\n");
}

function descargar(texto: string, nombre: string) {
  const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera después, no de una: algunos navegadores cortan la descarga si
  // la dirección desaparece en el mismo instante del clic.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** AAAA-MM-DD en Caracas: así el nombre del archivo ordena bien y no depende del reloj del navegador. */
function hoyArchivo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
