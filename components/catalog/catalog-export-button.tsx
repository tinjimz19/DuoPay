"use client";

import { Download, Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import type { CatalogItem } from "@/components/catalog/catalog-card";
import { Button } from "@/components/ui/button";
import { ordenarCategorias } from "@/lib/catalog-order";
import { formatCurrency } from "@/lib/format";

/**
 * Exporta el catálogo a PDF: una portada con el nombre de la tienda y luego
 * los productos agrupados por categoría, con Calzado de primero.
 *
 * jsPDF entra por import dinámico —solo cuando se pulsa exportar— para no
 * cargar la librería en cada visita a la página.
 *
 * Las imágenes se pasan primero a un data URL y de ahí a un lienzo: dibujar
 * desde un data URL no "mancha" el lienzo (a diferencia de una dirección
 * remota), así que se pueden reencodear a JPEG sin chocar con CORS, y de paso
 * se achican para que el PDF no pese de más.
 */

interface ImagenLista {
  dataUrl: string;
  w: number;
  h: number;
}

const LADO_MAXIMO_PDF = 900;

async function cargarImagen(url: string): Promise<ImagenLista | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const dataUrl0 = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });

    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = rej;
      el.src = dataUrl0;
    });

    const escala = Math.min(
      1,
      LADO_MAXIMO_PDF / Math.max(img.naturalWidth, img.naturalHeight)
    );
    const ancho = Math.max(1, Math.round(img.naturalWidth * escala));
    const alto = Math.max(1, Math.round(img.naturalHeight * escala));

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const pincel = lienzo.getContext("2d");
    if (!pincel) return null;
    pincel.fillStyle = "#FFFFFF";
    pincel.fillRect(0, 0, ancho, alto);
    pincel.drawImage(img, 0, 0, ancho, alto);

    return {
      dataUrl: lienzo.toDataURL("image/jpeg", 0.82),
      w: img.naturalWidth,
      h: img.naturalHeight,
    };
  } catch {
    return null;
  }
}

function hoyArchivo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function CatalogExportButton({
  items,
  categoryLabel,
}: {
  items: CatalogItem[];
  categoryLabel: (slug: string) => string;
}) {
  const [loading, setLoading] = React.useState(false);
  const vacio = items.length === 0;

  async function exportar() {
    if (vacio || loading) return;
    setLoading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });

      const W = 210;
      const H = 297;
      const M = 12;
      const abajo = H - M;

      // Las imágenes de todos los productos, cargadas de una. Un mapa por id
      // para no volver a pedir la misma.
      const imagenes = new Map<string, ImagenLista | null>();
      await Promise.all(
        items.map(async (it) => {
          if (it.image_url) imagenes.set(it.id, await cargarImagen(it.image_url));
        })
      );
      // --- PORTADA FIJA ---
      // Imagen de marca a página completa sobre fondo negro. Es siempre la
      // misma (public/catalogo-portada.jpg); solo esta cuenta usa la función,
      // así que la portada no se sube ni cambia, va fija con la app.
      const portada = await cargarImagen("/catalogo-portada.jpg");
      let coverDibujada = false;
      if (portada) {
        doc.setFillColor(0, 0, 0);
        doc.rect(0, 0, W, H, "F");
        const lado = W; // cuadrada, a todo el ancho de la página
        doc.addImage(portada.dataUrl, "JPEG", 0, (H - lado) / 2, lado, lado);
        coverDibujada = true;
      }

      // --- PRODUCTOS ---
      const grupos = new Map<string, CatalogItem[]>();
      for (const it of items) {
        const l = grupos.get(it.category) ?? [];
        l.push(it);
        grupos.set(it.category, l);
      }
      const orden = ordenarCategorias(Array.from(grupos.keys()), categoryLabel);

      const cols = 3;
      const gap = 5;
      const colW = (W - 2 * M - gap * (cols - 1)) / cols; // ~58.7mm
      const imgH = 46;
      const textoH = 20;
      const cardH = imgH + 4 + textoH;

      // Los productos empiezan en página nueva solo si hubo portada; si la
      // imagen no cargó, se aprovecha la primera página en vez de dejarla en
      // blanco.
      if (coverDibujada) doc.addPage();
      let cursorY = M;

      const encabezado = (label: string, cont = false) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(20, 20, 30);
        doc.text(cont ? `${label} (cont.)` : label, M, cursorY + 5);
        doc.setDrawColor(210, 210, 220);
        doc.line(M, cursorY + 8, W - M, cursorY + 8);
        cursorY += 14;
      };

      const dibujarProducto = (it: CatalogItem, x: number) => {
        // Caja de la imagen.
        doc.setFillColor(245, 246, 248);
        doc.rect(x, cursorY, colW, imgH, "F");
        const im = imagenes.get(it.id);
        if (im) {
          const aspecto = im.w / im.h;
          let dw = colW;
          let dh = colW / aspecto;
          if (dh > imgH) {
            dh = imgH;
            dw = imgH * aspecto;
          }
          const ix = x + (colW - dw) / 2;
          const iy = cursorY + (imgH - dh) / 2;
          doc.addImage(im.dataUrl, "JPEG", ix, iy, dw, dh);
        }

        // Texto debajo (más compacto, porque la tarjeta es más angosta con 3).
        let ty = cursorY + imgH + 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(20, 20, 30);
        const nombre = doc.splitTextToSize(it.name, colW).slice(0, 2);
        doc.text(nombre, x, ty);
        ty += nombre.length * 4 + 1;

        if (it.price !== null) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(60, 60, 200);
          doc.text(formatCurrency(it.price), x, ty);
          ty += 4.5;
        }

        if (it.note) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(120, 120, 130);
          const nota = doc.splitTextToSize(it.note, colW).slice(0, 1);
          doc.text(nota, x, ty);
        }
      };

      for (const slug of orden) {
        const lista = grupos.get(slug) ?? [];
        if (lista.length === 0) continue;

        // Espacio para el encabezado y al menos una fila.
        if (cursorY + 14 + cardH > abajo) {
          doc.addPage();
          cursorY = M;
        }
        encabezado(categoryLabel(slug));

        for (let i = 0; i < lista.length; i += cols) {
          if (cursorY + cardH > abajo) {
            doc.addPage();
            cursorY = M;
            encabezado(categoryLabel(slug), true);
          }
          for (let j = 0; j < cols; j++) {
            const it = lista[i + j];
            if (it) dibujarProducto(it, M + j * (colW + gap));
          }
          cursorY += cardH + gap;
        }
        cursorY += 4;
      }

      doc.save(`catalogo-${hoyArchivo()}.pdf`);
      toast.success("Catálogo exportado");
    } catch (e) {
      toast.error(
        e instanceof Error ? `No se pudo generar el PDF: ${e.message}` : "No se pudo generar el PDF"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9"
      disabled={vacio || loading}
      onClick={exportar}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Exportar PDF
    </Button>
  );
}
