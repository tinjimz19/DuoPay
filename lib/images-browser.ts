import { CALIDAD, LADO_MAXIMO, extensionDeTipo } from "@/lib/images";

/**
 * Encoge una foto en el navegador antes de subirla.
 *
 * POR QUÉ SE ENCOGE AQUÍ Y NO SE SUBE TAL CUAL
 *
 * Una foto de un teléfono actual pesa entre 3 y 8 MB. La misma foto a
 * 1280 px de lado largo pesa unos 150 KB y se ve idéntica en la tarjeta
 * de un pedido. La diferencia, sobre el gigabyte que da el plan gratuito,
 * es entre unas 7.000 fotos y unas 200.
 *
 * LA ORIENTACIÓN
 *
 * `imageOrientation: "from-image"` no es opcional. Las fotos verticales
 * de un teléfono se guardan giradas y con una etiqueta EXIF que dice
 * cuánto hay que girarlas de vuelta. Al dibujarlas en un lienzo esa
 * etiqueta se pierde: sin esta opción, toda foto tomada en vertical se
 * sube acostada. Es el fallo clásico de las subidas de fotos.
 *
 * SI ALGO FALLA, SE SUBE LA ORIGINAL
 *
 * `createImageBitmap` no existe en algún navegador viejo, o el archivo
 * está corrupto. En ese caso se devuelve el archivo tal como vino: pesará
 * más, pero el pedido se guarda con su foto. Una foto grande es mejor que
 * ninguna foto.
 */
export async function encogerFoto(archivo: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(archivo, {
      imageOrientation: "from-image",
    });

    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));

    // Ya es chica: no tiene sentido recomprimirla. Volver a codificar un
    // JPEG siempre le quita calidad, aunque el tamaño no baje.
    if (escala === 1 && archivo.size <= 400 * 1024) {
      bitmap.close();
      return archivo;
    }

    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;

    const pincel = lienzo.getContext("2d");
    if (!pincel) {
      bitmap.close();
      return archivo;
    }

    // Un fondo blanco debajo: un PNG con transparencia pasado a JPEG deja
    // el fondo negro, y una foto de producto con fondo negro se ve rota.
    pincel.fillStyle = "#FFFFFF";
    pincel.fillRect(0, 0, ancho, alto);
    pincel.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const trozo = await new Promise<Blob | null>((resolver) =>
      lienzo.toBlob(resolver, "image/jpeg", CALIDAD)
    );

    // Si comprimir no ganó nada —pasa con capturas de pantalla, que ya
    // vienen muy optimizadas— nos quedamos con la original.
    if (!trozo || trozo.size >= archivo.size) return archivo;

    const nombre = `${archivo.name.replace(/\.[^.]+$/, "")}.jpg`;
    return new File([trozo], nombre, { type: "image/jpeg" });
  } catch {
    return archivo;
  }
}

/** La extensión que le corresponde al archivo ya listo para subir. */
export function extensionDeArchivo(archivo: File): string {
  return extensionDeTipo(archivo.type);
}
