/**
 * Las fotos de referencia de los pedidos.
 *
 * POR QUÉ ESTO ES CÓDIGO COMPARTIDO Y NO TRES CONSTANTES SUELTAS
 *
 * La forma de la ruta NO es un detalle de organización: es parte de la
 * seguridad. La política del depósito compara la primera carpeta de la
 * ruta contra quien está subiendo —`(storage.foldername(name))[1] =
 * auth.uid()`—, así que una ruta armada distinta en la app móvil no
 * subiría "en otro sitio": sería rechazada, o peor, quedaría en un lugar
 * que la política no cubre. Una sola función arma la ruta y las dos
 * aplicaciones la usan.
 *
 * Y el tamaño tampoco es capricho. El plan gratuito de Supabase da 1 GB.
 * A 1280 px de lado largo y calidad 0.7, una foto de un perfume pesa unos
 * 150 KB: entran unas 7.000. Si la web comprimiera a 1280 y el teléfono
 * subiera la foto original de 12 megapíxeles, el mismo gigabyte se
 * llenaría con 300 fotos y nadie se enteraría hasta que empezara a fallar.
 */

/** El depósito. Privado: las direcciones se firman al mostrarlas. */
export const BUCKET_DE_PEDIDOS = "pedidos";

/** El lado largo al que se encoge la foto antes de subirla. */
export const LADO_MAXIMO = 1280;

/** La calidad del JPEG. 0.7 es donde deja de notarse y sigue pesando poco. */
export const CALIDAD = 0.7;

/**
 * El tope duro, en bytes.
 *
 * Lo mismo que declara el depósito en la base. Se repite aquí para poder
 * avisar ANTES de subir —con un mensaje que se entienda— en vez de
 * esperar a que el servidor rechace con un error en inglés.
 */
export const MAXIMO_BYTES = 5 * 1024 * 1024;

const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"] as const;

export function esImagenPermitida(tipo: string | null | undefined): boolean {
  if (!tipo) return false;
  return (TIPOS_PERMITIDOS as readonly string[]).includes(tipo.toLowerCase());
}

/**
 * La ruta de la foto dentro del depósito.
 *
 * `<id de la tienda>/<id del pedido>-<momento>.<extensión>`
 *
 * Lleva el id del pedido delante para que un archivo huérfano se pueda
 * rastrear hasta su pedido mirando el nombre, sin consultar nada. Y lleva
 * el momento porque al reemplazar una foto conviene que el nombre cambie:
 * si se reusara el mismo, la foto vieja seguiría viéndose un rato por la
 * caché del navegador y parecería que el cambio no se guardó.
 */
export function rutaDeFotoDePedido(
  userId: string,
  pedidoId: string,
  extension = "jpg",
  ahora: number = Date.now()
): string {
  const limpia = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  return `${userId}/${pedidoId}-${ahora}.${limpia}`;
}

/**
 * La extensión que le toca a un tipo de archivo.
 *
 * Se usa el tipo declarado y no el nombre original: un archivo llamado
 * "foto.jpg" que en realidad es un PNG existe, y lo que el depósito
 * comprueba es el tipo, no el nombre.
 */
export function extensionDeTipo(tipo: string | null | undefined): string {
  switch ((tipo ?? "").toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

/**
 * ¿La foto que se va a subir cabe? Si no, el motivo, en castellano.
 *
 * Devuelve null cuando está bien. Es la forma de que los dos formularios
 * —el de la web y el del teléfono— den exactamente el mismo mensaje.
 */
export function revisarFoto(params: {
  tipo: string | null | undefined;
  bytes: number;
}): string | null {
  if (!esImagenPermitida(params.tipo)) {
    return "Esa foto tiene que ser JPG, PNG o WEBP.";
  }
  if (!Number.isFinite(params.bytes) || params.bytes <= 0) {
    return "Esa foto está vacía.";
  }
  if (params.bytes > MAXIMO_BYTES) {
    return "La foto no debe pasar de 5 MB.";
  }
  return null;
}
